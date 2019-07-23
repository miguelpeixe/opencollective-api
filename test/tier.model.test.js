import { expect } from 'chai';
import { SequelizeValidationError } from 'sequelize';
import models from '../server/models';
import * as utils from '../test/utils';

const { Collective, User } = models;

describe('Collective model', () => {
  let collective = {},
    tiers;

  const collectiveData = {
    slug: 'tipbox',
    name: 'tipbox',
    currency: 'USD',
    tags: ['#brusselstogether'],
    tiers: [
      {
        name: 'backer',
        range: [2, 100],
        interval: 'monthly',
      },
      {
        name: 'sponsor',
        range: [100, 100000],
        interval: 'yearly',
      },
    ],
  };

  const users = [
    {
      username: 'xdamman',
      email: 'xdamman@opencollective.com',
    },
    {
      username: 'piamancini',
      email: 'pia@opencollective.com',
    },
  ];

  before(() => utils.resetTestDB());

  before(() =>
    Collective.create(collectiveData)
      .then(c => (collective = c))
      .then(() => User.createMany(users))
      .then(() =>
        models.Tier.createMany(
          [
            { type: 'TICKET', name: 'ticket 1', amount: 1000, maxQuantity: 10 },
            { type: 'TIER', name: 'backer', amount: 500, interval: 'month' },
            {
              type: 'TIER',
              name: 'sponsor',
              amount: 1000000,
              interval: 'year',
            },
            { type: 'TIER', name: 'donor', slug: 'donors', amount: 0 },
          ],
          { CollectiveId: collective.id },
        ),
      )
      .then(ts => (tiers = ts))
      .then(() =>
        models.Order.create({
          quantity: 2,
          TierId: tiers[0].id,
          processedAt: new Date(),
          FromCollectiveId: 1,
          CollectiveId: collective.id,
        }),
      ),
  );

  it('checks available quantity', () =>
    tiers[0]
      .checkAvailableQuantity(2)
      .then(available => {
        expect(available).to.be.true;
      })
      .then(() => tiers[0].checkAvailableQuantity(12))
      .then(available => {
        expect(available).to.be.false;
      }));

  describe('amount', () => {
    it('cannot have a negative value', () => {
      return expect(
        models.Tier.create({
          type: 'TIER',
          name: 'sponsor',
          amount: -5,
          interval: 'year',
        }),
      ).to.be.rejectedWith(SequelizeValidationError, 'Validation min on amount failed');
    });

    it('can have a 0 value', () => {
      return expect(
        models.Tier.create({
          type: 'TIER',
          name: 'sponsor',
          amount: 0,
          interval: 'year',
        }),
      ).to.be.fulfilled;
    });
  });
});
