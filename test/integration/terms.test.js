const request = require('supertest');
const app = require('../../app');
const chai = require('chai');
const should = chai.should();

describe('/terms endpoint', () => {
  let endpoint;
  before(() => {
    endpoint = '/api/terms';
  });

  it('responds with a 200', (done) => {
    request(app)
      .get(endpoint)
      .expect(200)
      .end(done);
  });

  describe('simple search', () => {
    it('includes a "total" count of at least 13', (done) => {
      request(app)
        .get(`${endpoint}?term_type=agency.acronym`)
        .expect(200)
        .expect(response => {
          response.body.total.should.be.at.least(20)
        })
        .end(done);
    });
  });
});
