import * as utils from './utils';
import { get, pick } from 'lodash';

const allTransactionsQuery = `
query allTransactions($collectiveSlug: String!, $limit: Int, $offset: Int, $type: String) {
  allTransactions(collectiveSlug: $collectiveSlug, limit: $limit, offset: $offset, type: $type) {
    id
    uuid
    type
    amount
    currency
    hostCurrency
    hostCurrencyFxRate
    hostFeeInHostCurrency
    platformFeeInHostCurrency
    paymentProcessorFeeInHostCurrency
    netAmountInCollectiveCurrency
    createdAt
    host {
      id
      slug
    }
    createdByUser {
      id
      email
    }
    fromCollective {
      id
      slug
      name
      image
    }
    collective {
      id
      slug
      name
      image
    }
    paymentMethod {
      id
      service
      name
    }
  }
}
`;

const getTransactionQuery = `
  query Transaction($id: Int, $uuid: String) {
    Transaction(id: $id, uuid: $uuid) {
      id
      uuid
      type
      createdAt
      description
      amount
      currency
      hostCurrency
      hostCurrencyFxRate
      netAmountInCollectiveCurrency
      hostFeeInHostCurrency
      platformFeeInHostCurrency
      paymentProcessorFeeInHostCurrency
      paymentMethod {
        id
        service
        name
      }
      fromCollective {
        id
        slug
        name
        image
      }
      collective {
        id
        slug
        name
        image
      }
      host {
        id
        slug
        name
        image
      }
      ... on Order {
        order {
          id
          status
          subscription {
            id
            interval
          }
        }
      }
    }
  }
`;

/**
 * Get array of all transactions of a collective given its slug
 */
export const getLatestTransactions = async (req, res) => {
  try {
    const args = pick(req.query, ['limit', 'offset', 'type']);
    args.collectiveSlug = get(req, 'params.collectiveSlug');
    if (args.limit) {
      args.limit = Number(args.limit);
    }
    if (args.offset) {
      args.offset = Number(args.offset);
    }
    const response = await utils.graphqlQuery(allTransactionsQuery, args, req.remoteUser);
    if (response.errors) {
      throw new Error(response.errors[0]);
    }
    const result = get(response, 'data.allTransactions', []);
    res.send({ result });
  } catch (error) {
    res.status(400).send({ error: error.toString() });
  }
};

/**
 * Get one transaction of a collective given its uuid
 */
export const getTransaction = async (req, res) => {
  try {
    const response = await utils.graphqlQuery(getTransactionQuery, pick(req.params, ['id', 'uuid']), req.remoteUser);
    if (response.errors) {
      throw new Error(response.errors[0]);
    }
    const result = get(response, 'data.Transaction');
    if (req.params.collectiveSlug !== result.collective.slug) {
      res.status(404).send({ error: 'Not a collective transaction.' });
    } else {
      res.send({ result });
    }
  } catch (error) {
    res.status(400).send({ error: error.toString() });
  }
};
