// dependencies
import _ from 'lodash';
import express from 'express';
import request from 'supertest';
import faker from 'faker';
import { expect } from 'chai';

import { smssync } from '../src/index';

const app = express();

describe('smssync', () => {
  app.use(
    smssync({
      onReceive(sms, done) {
        // assert received sms
        expect(_.get(sms, 'from')).to.exist;
        expect(_.get(sms, 'message')).to.exist;
        expect(_.get(sms, 'message_id')).to.exist;
        expect(_.get(sms, 'sent_to')).to.exist;
        expect(_.get(sms, 'device_id')).to.exist;
        expect(_.get(sms, 'sent_timestamp')).to.exist;
        expect(_.get(sms, 'hash')).to.exist;

        // reply
        const reply = {
          to: _.get(sms, 'from'),
          uuid: _.get(sms, 'message_id'),
          message: _.get(sms, 'message'),
        };
        done(null, reply);
      },

      onSend(done) {
        const sms = {
          to: faker.phone.phoneNumber(),
          message: faker.lorem.sentence(),
          uuid: faker.random.uuid(),
        };

        done(null, [sms]);
      },

      onSent(queued, done) {
        // assert queued sms
        expect(queued).to.exist;
        expect(queued).to.be.an('array');
        expect(queued).to.have.length(1);

        // received queued message from a device
        done(null, queued);
      },

      onQueued(done) {
        // obtain sms waiting delivery report
        done(null, [faker.random.uuid()]);
      },

      onDelivered(delivered, done) {
        // assert delivery reports
        expect(delivered).to.be.an('array');

        // assert single delivery report
        const first = delivered[0];
        expect(first).to.exist;
        expect(_.get(first, 'uuid')).to.exist;
        expect(_.get(first, 'sent_result_code')).to.exist;
        expect(_.get(first, 'sent_result_message')).to.exist;
        expect(_.get(first, 'delivered_result_code')).to.exist;
        expect(_.get(first, 'delivered_result_message')).to.exist;

        done(null, delivered);
      },
    })
  );

  it('should be able to receive sync sms from a device', (done) => {
    const sms = {
      from: faker.phone.phoneNumber(),
      message: faker.lorem.sentence(),
      message_id: faker.random.uuid(),
      sent_to: faker.phone.phoneNumber(),
      secret: 'smssync',
      device_id: faker.phone.phoneNumber(),
      sent_timestamp: faker.date.past(),
    };

    request(app)
      .post('/smssync?secret=smssync')
      .send(sms)
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .end((error, response) => {
        expect(error).to.not.exist;
        expect(response).to.exist;

        const { body } = response;

        expect(body).to.exist;
        expect(body.payload).to.exist;

        expect(body.payload.messages[0].to).to.be.equal(_.get(sms, 'from'));

        expect(body.payload.messages[0].message).to.be.equal(
          _.get(sms, 'message')
        );

        expect(body.payload.messages[0].uuid).to.be.equal(
          _.get(sms, 'message_id')
        );

        done(error, response);
      });
  });

  it('should be able to receive queued sms to be sent by a device', (done) => {
    const queued = {
      queued_messages: [faker.random.uuid()],
    };

    request(app)
      .post('/smssync?task=sent&secret=smssync')
      .send(queued)
      .set('Accept', 'application/json')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((error, response) => {
        expect(error).to.not.exist;
        expect(response).to.exist;

        const { body } = response;

        expect(body).to.exist;
        expect(_.get(body, 'queued_messages')).to.exist;
        expect(_.get(body, 'queued_messages')).to.have.same.members(
          _.get(queued, 'queued_messages')
        );

        done(error, response);
      });
  });

  it('should be able to receive delivery reports sent by a device', (done) => {
    const delivered = {
      message_result: [
        {
          uuid: faker.random.uuid(),
          sent_result_code: 0,
          sent_result_message: 'SMSSync Message Sent',
          delivered_result_code: -1,
          delivered_result_message: '',
        },
      ],
    };

    request(app)
      .post('/smssync?task=result&secret=smssync')
      .send(delivered)
      .set('Accept', 'application/json')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((error, response) => {
        expect(error).to.not.exist;
        expect(response).to.exist;

        const { body } = response;

        expect(body).to.exist;
        expect(body.payload).to.exist;
        expect(body.payload.success).to.be.true;

        done(error, response);
      });
  });

  it('should be able to return sms to be sent by device', (done) => {
    request(app)
      .get('/smssync?secret=smssync')
      .set('Accept', 'application/json')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((error, response) => {
        expect(error).to.not.exist;
        expect(response).to.exist;

        const { body } = response;

        expect(body).to.exist;
        expect(body.payload).to.exist;

        expect(body.payload.task).to.exist;
        expect(body.payload.task).to.be.equal('send');

        expect(body.payload.secret).to.exist;
        expect(body.payload.secret).to.be.equal('smssync');

        expect(body.payload.messages[0].to).to.exist;

        expect(body.payload.messages[0].message).to.exist;

        expect(body.payload.messages[0].uuid).to.be.exist;

        done(error, response);
      });
  });

  it('should be able to return sms waiting delivery report to a device', (done) => {
    request(app)
      .get('/smssync?task=result&secret=smssync')
      .set('Accept', 'application/json')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((error, response) => {
        expect(error).to.not.exist;
        expect(response).to.exist;

        const { body } = response;

        expect(body).to.exist;
        expect(_.get(body, 'message_uuids')).to.exist;

        done(error, response);
      });
  });

  it('should be able to reject request with no secret key sent by device', (done) => {
    request(app)
      .get('/smssync')
      .set('Accept', 'application/json')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((error, response) => {
        expect(error).to.not.exist;
        expect(response).to.exist;

        const { body } = response;

        expect(body).to.exist;
        expect(body.payload).to.exist;
        expect(body.payload.success).to.exist;
        expect(body.payload.error).to.exist;
        expect(body.payload.success).to.be.false;
        expect(body.payload.error).to.be.equal('Secret Key Mismatch');

        done();
      });
  });
});
