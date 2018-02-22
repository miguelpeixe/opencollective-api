import Promise from 'bluebird';
import { includes, pick, get } from 'lodash';
import { Op } from 'sequelize';

import models from '../models';
import emailLib from './email';
import { types } from '../constants/collectives';
import paymentProviders from '../paymentProviders';
import * as libsubscription from './subscriptions';

/** Find payment method handler
 *
 * @param {Object} paymentMethod: This must point to a row in the
 *  `PaymentMethods` table. That information is retrieved and the
 *  fields `service' & `type' are used to figure out which payment
 *  {service: 'stripe', type: 'bitcoin'}.
 * @return the payment method's JS module.
 */
export function findPaymentMethod(paymentMethod) {
  const provider = paymentMethod ? paymentMethod.service : 'manual';
  const methodType = paymentMethod.type || 'default';
  return paymentProviders[provider].types[methodType]; // eslint-disable-line import/namespace
}

/** Process an order using its payment information
 *
 * @param {Object} order must contain a valid `paymentMethod`
 *  field. Which means that the query to select the order must include
 *  the `PaymentMethods` table.
 */
export async function processOrder(order, options) {
  const paymentMethod = findPaymentMethod(order.paymentMethod);
  return await paymentMethod.processOrder(order, options);
}

/** Refund a transaction
 *
 * @param {Object} transaction must contain a valid `PaymentMethod`
 *  field. Which means that the query to select it from the DB must
 *  include the `PaymentMethods` table.
 */
export async function refundTransaction(transaction) {
  const paymentMethod = findPaymentMethod(transaction.PaymentMethod);
  return await paymentMethod.refundTransaction(transaction);
}

/** Create refund transactions
 *
 * This function creates the negative transactions after refunding an
 * existing transaction.
 *
 * If a CREDIT transaction from collective A to collective B is
 * received. Two new transactions are created:
 *
 *   1. CREDIT from collective B to collective A
 *   2. DEBIT from collective A to collective B
 *
 * @param {Objet<models.Transaction>} transaction Can be either a
 *  DEBIT or a CREDIT transaction and it will generate a pair of
 *  transactions that debit the collective that was credited and
 *  credit the user that was debited.
 * @param {Integer} refundedPaymentProcessorFee is the amount refunded
 *  by the payment processor. If it's 0 (zero) it means that the
 *  payment processor didn't refund its fee at all. In that case, the
 *  equivalent value will be moved from the host so the user can get
 *  the full refund.
 * @param {Object} data contains the information from the payment
 *  method that should be saved within the *data* field of the
 *  transactions being created.
 */
export async function createRefundTransaction(transaction, refundedPaymentProcessorFee, data) {
  /* If the transaction passed isn't the one from the collective
   * perspective, the opposite transaction is retrieved. */
  const collectiveLedger = (transaction.type === 'CREDIT') ? transaction :
        await models.Transaction.find({ where: {
          TransactionGroup: transaction.TransactionGroup,
          id: { [Op.ne]: transaction.id }
        } });
  const userLedgerRefund = pick(collectiveLedger, [
    'FromCollectiveId', 'CollectiveId', 'HostCollectiveId', 'PaymentMethodId',
    'CreatedByUserId', 'OrderId', 'hostCurrencyFxRate', 'hostCurrency',
    'hostFeeInHostCurrency', 'platformFeeInHostCurrency',
    'paymentProcessorFeeInHostCurrency',
  ]);
  userLedgerRefund.amount = -collectiveLedger.amount;
  userLedgerRefund.amountInHostCurrency = -collectiveLedger.amountInHostCurrency;
  userLedgerRefund.netAmountInCollectiveCurrency =
    -Math.round((collectiveLedger.amountInHostCurrency
                 - collectiveLedger.platformFeeInHostCurrency
                 - collectiveLedger.hostFeeInHostCurrency
                 - collectiveLedger.paymentProcessorFeeInHostCurrency)
                * collectiveLedger.hostCurrencyFxRate);
  userLedgerRefund.description = `Refund of "${transaction.description}"`;
  userLedgerRefund.data = data;

  /* If the payment processor doesn't refund the fee, the equivalent
   * of the fee will be transferred from the host to the user so the
   * user can get the full refund. */
  if (refundedPaymentProcessorFee === 0) {
    userLedgerRefund.hostFeeInHostCurrency +=
      userLedgerRefund.paymentProcessorFeeInHostCurrency;
    userLedgerRefund.paymentProcessorFeeInHostCurrency = 0;
  }
  return models.Transaction.createDoubleEntry(userLedgerRefund);
}

export async function associateTransactionRefundId(transaction, refund) {
  const [tr1, tr2, tr3, tr4] = await models.Transaction.findAll({
    order: ['id'],
    where: { [Op.or]: [
      { TransactionGroup: transaction.TransactionGroup },
      { TransactionGroup: refund.TransactionGroup },
    ] }
  });

  tr1.refundId = tr4.id; await tr1.save(); // User Ledger
  tr2.refundId = tr3.id; await tr2.save(); // Collective Ledger
  tr3.refundId = tr2.id; await tr3.save(); // Collective Ledger
  tr4.refundId = tr1.id; await tr4.save(); // User Ledger
}

/**
 * Execute an order as user using paymentMethod
 * It validates the paymentMethod and makes sure the user can use it
 * @param {*} order { tier, description, totalAmount, currency, interval (null|month|year), paymentMethod }
 * @param options { hostFeePercent, platformFeePercent} (only for add funds and if remoteUser is admin of host or root)
 */
export const executeOrder = (user, order, options) => {

  if (! (order instanceof models.Order)) {
    return Promise.reject(new Error("order should be an instance of the Order model"));
  }
  if (!order) {
    return Promise.reject(new Error("No order provided"));
  }
  if (order.processedAt) {
    return Promise.reject(new Error(`This order (#${order.id}) has already been processed at ${order.processedAt}`));
  }

  const payment = {
    amount: order.totalAmount,
    interval: order.interval,
    currency: order.currency
  };

  try {
    validatePayment(payment);
  } catch (error) {
    return Promise.reject(error);
  }

  return order.populate()
    .then(() => {
      if (payment.interval) {
        return models.Subscription.create(payment).then(subscription => {
          // The order instance doesn't have the Subscription field
          // here because it was just created and no models were
          // included so we're doing that manually here. Not the
          // cutest but works.
          order.Subscription = subscription;
          const updatedDates = libsubscription.getNextChargeAndPeriodStartDates('new', order);
          order.Subscription.nextChargeDate = updatedDates.nextChargeDate;
          order.Subscription.nextPeriodStart = updatedDates.nextPeriodStart || order.Subscription.nextPeriodStart;
          return subscription.save();
        }).then((subscription) => {
          return order.update({ SubscriptionId: subscription.id });
        })
      }
    })
    .then(() => {
      return processOrder(order, options)
        .tap(async () => {
          if (!order.matchingFund) return;
          const matchingFundCollective = await models.Collective.findById(order.matchingFund.CollectiveId);
          // if there is a matching fund, we execute the order
          // also adds the owner of the matching fund as a BACKER of collective
          const matchingOrder = {
            ...pick(order, ['id', 'collective', 'tier', 'currency']),
            totalAmount: order.totalAmount * order.matchingFund.matching,
            paymentMethod: order.matchingFund,
            FromCollectiveId: order.matchingFund.CollectiveId,
            fromCollective: matchingFundCollective,
            description: `Matching ${order.matchingFund.matching}x ${order.fromCollective.name}'s donation`,
            createdByUser: await matchingFundCollective.getUser()
          };

          // processOrder expects an update function to update `order.processedAt`
          matchingOrder.update = () => {};

          return paymentProviders[order.paymentMethod.service].types[order.paymentMethod.type || 'default'].processOrder(matchingOrder, options) // eslint-disable-line import/namespace
            .then(transaction => {
              sendOrderConfirmedEmail({
                ...order,
                transaction
              });
            })
        });
    })
    .then(transaction => {
      // for gift cards
      if (!transaction && order.paymentMethod.service === 'opencollective' && order.paymentMethod.type === 'prepaid') {
        sendOrderProcessingEmail(order)
        .then(() => sendSupportEmailForManualIntervention(order)); // async
      } else if (!transaction && order.paymentMethod.service === 'stripe' && order.paymentMethod.type === 'bitcoin') {
        sendOrderProcessingEmail(order); // async
      } else {
        order.transaction = transaction;
        sendOrderConfirmedEmail(order); // async
      }
      return transaction;
    })
    .tap(async (transaction) => {
      // Credit card charges are synchronous. If the transaction is
      // created here it means that the payment went through so it's
      // safe to enable subscriptions after this.
      if (payment.interval && transaction) await order.Subscription.activate();
    });
}

const validatePayment = (payment) => {
  if (payment.interval && !includes(['month', 'year'], payment.interval)) {
    throw new Error('Interval should be null, month or year.');
  }

  if (!payment.amount) {
    throw new Error('payment.amount missing');
  }

  if (payment.amount < 50) {
    throw new Error('payment.amount must be at least $0.50');
  }
}

const sendOrderConfirmedEmail = async (order) => {
  const { collective, tier, interval, fromCollective } = order;
  const user = order.createdByUser;

  if (collective.type === types.EVENT) {
    return emailLib.send('ticket.confirmed', user.email,
      {
        order: pick(order, ['totalAmount', 'currency', 'createdAt', 'quantity']),
        user: user.info,
        recipient: { name: fromCollective.name },
        collective: collective.info,
        tier: tier.info
      },
      {
        from: `${collective.name} <hello@${collective.slug}.opencollective.com>`
      });
  } else {
    // normal order
    const relatedCollectives = await collective.getRelatedCollectives(2, 0);
    const emailOptions = { from: `${collective.name} <hello@${collective.slug}.opencollective.com>` };
    const data = {
      order: pick(order, ['totalAmount', 'currency', 'createdAt']),
      transaction: pick(order.transaction, ['createdAt', 'uuid']),
      user: user.info,
      collective: collective.info,
      fromCollective: fromCollective.minimal,
      interval,
      relatedCollectives,
      monthlyInterval: (interval === 'month'),
      firstPayment: true,
      subscriptionsLink: interval && user.generateLoginLink(`/${fromCollective.slug}/subscriptions`)
    };

    let matchingFundCollective;
    if (order.matchingFund) {
      matchingFundCollective = await models.Collective.findById(order.matchingFund.CollectiveId)
      data.matchingFund = {
        collective: pick(matchingFundCollective, ['slug', 'name', 'image']),
        matching: order.matchingFund.matching,
        amount: order.matchingFund.matching * order.totalAmount
      }
    }

    // sending the order confirmed email to the matching fund owner or to the donor
    if (get(order, 'transaction.FromCollectiveId') === get(order, 'matchingFund.CollectiveId')) {
      order.matchingFund.info;
      const recipients = await matchingFundCollective.getEmails();
      emailLib.send('donationmatched', recipients, data, emailOptions)
    } else {
      emailLib.send('thankyou', user.email, data, emailOptions)
    }
  }
}

const sendSupportEmailForManualIntervention = (order) => {
  const user = order.createdByUser;
  return emailLib.sendMessage(
    'support@opencollective.com', 
    'Gift card order needs manual attention', 
    null, 
    { text: `Order Id: ${order.id} by userId: ${user.id}`});
}

// Assumes one-time payments, 
const sendOrderProcessingEmail = (order) => {
    const { collective, fromCollective } = order;
  const user = order.createdByUser;

  return emailLib.send(
      'processing',
      user.email,
      { order: order.info,
        user: user.info,
        collective: collective.info,
        fromCollective: fromCollective.minimal,
        subscriptionsLink: user.generateLoginLink(`/${fromCollective.slug}/subscriptions`)
      }, {
        from: `${collective.name} <hello@${collective.slug}.opencollective.com>`
      })
}
