// Test tools
import nock from 'nock';
import { expect } from 'chai';
import * as utils from './utils';

// Code components used for setting up the tests
import models from '../server/models';
import * as constants from '../server/constants/transactions';
import * as stripeGateway from '../server/paymentProviders/stripe/gateway';

// The GraphQL query that will refund a transaction (it returns the
// transaction being refunded)
const refundQuery = `
  mutation refundTransaction($id: Int!) {
    refundTransaction(id: $id) {
      id
    }
  }
`;

async function setupTestObjects() {
  const user = await models.User.createUserWithCollective(utils.data('user1'));
  const host = await models.User.createUserWithCollective(utils.data('host1'));
  const collective = await models.Collective.create(utils.data('collective1'));
  await collective.addHost(host.collective);
  const tier = await models.Tier.create(utils.data('tier1'));
  const paymentMethod = await models.PaymentMethod.create(utils.data('paymentMethod2'));
  await models.ConnectedAccount.create({
    service: 'stripe',
    token: 'sk_test_XOFJ9lGbErcK5akcfdYM1D7j',
    username: 'acct_198T7jD8MNtzsDcg',
    CollectiveId: host.id
  });
  const order = await models.Order.create({
    description: 'Donation',
    totalAmount: 5000,
    currency: 'USD',
    TierId: tier.id,
    CreatedByUserId: user.id,
    FromCollectiveId: user.CollectiveId,
    CollectiveId: collective.id,
    PaymentMethodId: paymentMethod.id
  });
  const charge = {
    "id": "ch_1Bs9ECBYycQg1OMfGIYoPFvk",
    "object": "charge",
    "amount": 5000,
    "amount_refunded": 0,
    "application": "ca_68FQ4jN0XMVhxpnk6gAptwvx90S9VYXF",
    "application_fee": "fee_1Bs9EEBYycQg1OMfdtHLPqEr",
    "balance_transaction": "txn_1Bs9EEBYycQg1OMfTR33Y5Xr",
    "captured": true,
    "created": 1517834264,
    "currency": "usd",
    "customer": "cus_9sKDFZkPwuFAF8"
  };
  const balanceTransaction = {
    "id": "txn_1Bs9EEBYycQg1OMfTR33Y5Xr",
    "object": "balance_transaction",
    "amount": 5000,
    "currency":"usd",
    "fee": 425,
    "fee_details": [
      {"amount": 175, "currency":"usd", "type": "stripe_fee"},
      {"amount": 250, "currency": "usd", "type": "application_fee"}
    ],
    "net": 4575,
    "status": "pending",
    "type": "charge"
  };
  const fees = stripeGateway.extractFees(balanceTransaction);
  const payload = {
    CreatedByUserId: user.id,
    FromCollectiveId: user.CollectiveId,
    CollectiveId: collective.id,
    PaymentMethodId: paymentMethod.id,
    transaction: {
      type: constants.type.CREDIT,
      OrderId: order.id,
      amount: order.totalAmount,
      currency: order.currency,
      hostCurrency: balanceTransaction.currency,
      amountInHostCurrency: balanceTransaction.amount,
      hostCurrencyFxRate: order.totalAmount / balanceTransaction.amount,
      hostFeeInHostCurrency: parseInt(balanceTransaction.amount * collective.hostFeePercent / 100, 10),
      platformFeeInHostCurrency: fees.applicationFee,
      paymentProcessorFeeInHostCurrency: fees.stripeFee,
      description: order.description,
      data: { charge, balanceTransaction }
    }
  };
  const transaction = await models.Transaction.createFromPayload(payload);
  return { user, host, collective, tier, paymentMethod, order, transaction };
}

describe("Refund Transaction", () => {
  /* All the tests will touch the database, so resetting it is the
   * first thing we do. */
  beforeEach(async () => await utils.resetTestDB());

  it("should error if user isn't an admin of the host or the creator of the transaction", async () => {
    // Given that we create a user, host, collective, tier,
    // paymentMethod, an order and a transaction
    const { transaction } = await setupTestObjects();

    // And a newly created user
    const anotherUser = await models.User.createUserWithCollective(utils.data('user2'));

    // When a refunded attempt happens from another user
    const result = await utils.graphqlQuery(refundQuery, { id: transaction.id }, anotherUser);

    // Then it should error out with the right error
    const [{ message }] = result.errors;
    expect(message).to.equal('Not an admin neither owner');
  });

  /* Stripe will fully refund the processing fee for accounts created
   * prior to 09/17/17. The refunded fee can be seen in the balance
   * transaction call right after a refund.  The nock output isn't
   * complete but we really don't use the other fields retrieved from
   * Stripe. */
  describe("Stripe Transaction - for hosts created before September 17th 2017", () => {
    beforeEach(() => {
      nock('https://api.stripe.com:443')
        .post('/v1/refunds')
        .reply(200, { id: 're_1Bvu79LzdXg9xKNSFNBqv7Jn', amount: 5000, balance_transaction: 'txn_1Bvu79LzdXg9xKNSWEVCLSUu' });
      nock('https://api.stripe.com:443')
        .get('/v1/balance/history/txn_1Bvu79LzdXg9xKNSWEVCLSUu')
        .reply(200, { id: 'txn_1Bvu79LzdXg9xKNSWEVCLSUu', amount: -5000, fee: -175, fee_details: [{ amount: -175, type: 'stripe_fee' }], net: -4825 });
    });
    afterEach(nock.cleanAll);

    it('should create negative transactions with all the fees refunded', async () => {
      // Given that we create a user, host, collective, tier,
      // paymentMethod, an order and a transaction
      const { host, transaction } = await setupTestObjects();

      // When the above transaction is refunded
      const result = await utils.graphqlQuery(refundQuery, { id: transaction.id }, host);

      // Then there should be no errors
      if (result.errors) throw result.errors;

      // And then all the transactions with that same order id are
      // retrieved.
      const allTransactions = await models.Transaction.findAll({ where: { OrderId: transaction.OrderId } });

      // And two new transactions should be created in the
      // database.  This only makes sense in an empty database. For
      // order with subscriptions we'd probably find more than 4
      expect(allTransactions.length).to.equal(4);

      // And then the transaction created for the refund operation
      // should decrement all the fees in the CREDIT from collective
      // to user.
      const [tr1, tr2, tr3, tr4] = allTransactions;

      expect(tr3.type).to.equal('DEBIT');
      expect(tr3.amount).to.equal(-4075);
      expect(tr3.platformFeeInHostCurrency).to.be.null;
      expect(tr3.hostFeeInHostCurrency).to.be.null;
      expect(tr3.paymentProcessorFeeInHostCurrency).to.be.null;
      expect(tr3.refundId).to.equal(tr1.id);

      expect(tr4.type).to.equal('CREDIT');
      expect(tr4.amount).to.equal(5000);
      expect(tr4.platformFeeInHostCurrency).to.equal(250);
      expect(tr4.hostFeeInHostCurrency).to.equal(500);
      expect(tr4.paymentProcessorFeeInHostCurrency).to.equal(175);
      expect(tr4.refundId).to.equal(tr2.id);
    });

  }); /* describe("Stripe Transaction - for hosts created before September 17th 2017") */

  /* Stripe will not refund the processing fee for accounts created
   * after 09/17/17. The refunded fee will not appear in the balance
   * transaction call right after a refund.  The nock output isn't
   * complete but we really don't use the other fields retrieved from
   * Stripe. */
  describe("Stripe Transaction - for hosts created after September 17th 2017", () => {
    beforeEach(() => {
      nock('https://api.stripe.com:443')
        .post('/v1/refunds')
        .reply(200, { id: 're_1Bvu79LzdXg9xKNSFNBqv7Jn', amount: 5000, balance_transaction: 'txn_1Bvu79LzdXg9xKNSWEVCLSUu' });
      nock('https://api.stripe.com:443')
        .get('/v1/balance/history/txn_1Bvu79LzdXg9xKNSWEVCLSUu')
        .reply(200, { id: 'txn_1Bvu79LzdXg9xKNSWEVCLSUu', amount: -5000, fee: 0, fee_details: [], net: -5000 });
    });
    afterEach(nock.cleanAll);

    it('should create negative transactions without the stripe fee being refunded', async () => {
      // Given that we create a user, host, collective, tier,
      // paymentMethod, an order and a transaction
      const { host, transaction } = await setupTestObjects();

      // When the above transaction is refunded
      const result = await utils.graphqlQuery(refundQuery, { id: transaction.id }, host);

      // Then there should be no errors
      if (result.errors) throw result.errors;

      // And then all the transactions with that same order id are
      // retrieved.
      const allTransactions = await models.Transaction.findAll({ where: { OrderId: transaction.OrderId } });

      // And two new transactions should be created in the
      // database.  This only makes sense in an empty database. For
      // order with subscriptions we'd probably find more than 4
      expect(allTransactions.length).to.equal(4);

      // And then the transaction created for the refund operation
      // should decrement all the fees in the CREDIT from collective
      // to user.
      const [tr1, tr2, tr3, tr4] = allTransactions;

      expect(tr3.type).to.equal('DEBIT');
      expect(tr3.amount).to.equal(-4075);
      expect(tr3.platformFeeInHostCurrency).to.be.null;
      expect(tr3.hostFeeInHostCurrency).to.be.null;
      expect(tr3.paymentProcessorFeeInHostCurrency).to.be.null;
      expect(tr3.refundId).to.equal(tr1.id);

      expect(tr4.type).to.equal('CREDIT');
      expect(tr4.amount).to.equal(5000);
      expect(tr4.platformFeeInHostCurrency).to.equal(250);
      expect(tr4.hostFeeInHostCurrency).to.equal(675);
      expect(tr4.paymentProcessorFeeInHostCurrency).to.equal(0);
      expect(tr4.refundId).to.equal(tr2.id);
    });

  }); /* describe("Stripe Transaction - for hosts created after September 17th 2017") */

});  /* describe("Refund Transaction") */
