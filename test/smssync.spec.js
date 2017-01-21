'use strict';

//dependencies
const path = require('path');
const _ = require('lodash');
const express = require('express');
const smssync = require(path.join(__dirname, '..'));
const request = require('supertest');
const faker = require('faker');
const expect = require('chai').expect;
let app = express();

describe('smssync', function () {

  app.use(smssync({
    onReceive: function (sms, done) {
      //assert received sms
      expect(_.get(sms, 'from')).to.exist;
      expect(_.get(sms, 'message')).to.exist;
      expect(_.get(sms, 'message_id')).to.exist;
      expect(_.get(sms, 'sent_to')).to.exist;
      expect(_.get(sms, 'secret')).to.exist;
      expect(_.get(sms, 'device_id')).to.exist;
      expect(_.get(sms, 'sent_timestamp')).to.exist;

      //reply
      const reply = {
        to: _.get(sms, 'from'),
        uuid: _.get(sms, 'message_id'),
        message: _.get(sms, 'message')
      };
      done(null, reply);

    },
    onSend: function (done) {

      /*jshint camelcase:false*/
      const sms = {
        to: faker.phone.phoneNumber(),
        message: faker.lorem.sentence(),
        uuid: faker.random.uuid()
      };
      /*jshint camelcase:true*/

      done(null, [sms]);

    },
    onDelivered: function (smss, done) {
      done(null, smss);
    }
  }));

  it('should be able to receive sync sms from a device', function (done) {

    /*jshint camelcase:false*/
    const sms = {
      from: faker.phone.phoneNumber(),
      message: faker.lorem.sentence(),
      message_id: faker.random.uuid(),
      sent_to: faker.phone.phoneNumber(),
      secret: 'smssync',
      device_id: faker.phone.phoneNumber(),
      sent_timestamp: faker.date.past()
    };
    /*jshint camelcase:true*/

    request(app)
      .post('/smssync')
      .send(sms)
      .set('Accept', 'application/json')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (error, response) {

        expect(error).to.not.exist;
        expect(response).to.exist;

        const body = response.body;

        expect(body).to.exist;
        expect(body.payload).to.exist;

        expect(body.payload.messages[0].to)
          .to.be.equal(_.get(sms, 'from'));

        expect(body.payload.messages[0].message)
          .to.be.equal(_.get(sms, 'message'));

        expect(body.payload.messages[0].uuid)
          .to.be.equal(_.get(sms, 'message_id'));

        done(error, response);

      });

  });

  it('should be able to return sms to be sent by device', function (done) {

    request(app)
      .get('/smssync')
      .set('Accept', 'application/json')
      .expect(200)
      .expect('Content-Type', /json/)
      .end(function (error, response) {

        expect(error).to.not.exist;
        expect(response).to.exist;

        const body = response.body;

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

});
