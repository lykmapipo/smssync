/**
 * @name smssync
 * @description smsync endpoint for nodejs
 * @author lally elias <lallyelias87@mail.com>
 * @since  0.1.0
 * @version 0.1.0
 */

// dependencies
import _ from 'lodash';
import express from 'express';
import respond from 'express-respond';
import bodyParser from 'body-parser';
import hash from 'object-hash';

const router = express.Router();

// smssync tasks
export const TASK_SEND = 'send';
export const TASK_RESULT = 'result';
export const TASK_SENT = 'sent';

// sms message fields
export const MESSAGE_FIELDS = [
  'from',
  'message',
  'message_id',
  'sent_to',
  'device_id',
  'sent_timestamp',
];

export const smssync = optns => {
  // merge options
  const options = _.merge(
    {},
    {
      // endpoint path
      endpoint: 'smssync',

      // a secret key to be used verify smssync device
      secret: 'smssync',

      // allow to reply with a sms to a sender
      reply: true,

      // allow internal error handling & no error will be passed to error
      // middleware
      error: true,
    },
    optns
  );

  // use express respond
  router.use(respond);

  // apply body parser middlewares
  router.use(bodyParser.json());
  router.use(
    bodyParser.urlencoded({
      extended: true,
    })
  );

  // protect endpoint with secret
  if (options.secret && !_.isEmpty(options.secret)) {
    // use middleware to protect endpoint using a secret
    router.use((request, response, next) => {
      // obtain secret from query or body
      const secret =
        (request.query || {}).secret || (request.body || {}).secret;

      // ensure secret match
      const isValidSecret = options.secret === secret;

      // allowed request url
      const isAllowedRequest =
        request.method === 'POST' &&
        (request.query.task === TASK_SENT ||
          request.query.task === TASK_RESULT);

      // handle request if has valid secret
      if (isValidSecret || isAllowedRequest) {
        next();
      }

      // throw authorization error
      else {
        // prepare error
        const error = new Error('Secret Key Mismatch');

        // pass error to error handler middleware
        if (error && !options.error) {
          next(error);
        }

        // handle error
        else if (error && options.error) {
          // obtain error message
          const message = error.message || 'Fail to process delivery reports';

          // prepare smsync error response
          const reply = {
            payload: {
              success: false,
              error: message,
            },
          };

          // respond with error
          response.ok(reply);
        }
      }
    });
  }

  // TODO add sender blacklist

  /**
   * @description Handle Http POST on /smssync
   *
   * @description receive smssync sent sms
   * @param  {object} request  a http request
   * @param  {object} response a http response
   * @param {Function} next next middleware to invoke incase of error
   */
  router.post(`/${options.endpoint}`, (request, response, next) => {
    // obtain sent sms, queued sms uuids or sms delivery result
    let { body } = request;

    // obtain request task
    const { task } = request.query || {};

    // handle sent delivery status
    if (task && task === TASK_SENT) {
      // handle over queued message uuids
      const queued = _.get(body, 'queued_messages');
      options.onSent(queued, (error, result) => {
        // prepare sent reply
        const reply = {
          queued_messages: [].concat(result),
        };

        response.ok(reply);
      });
    }

    // handle delivery status(reports)
    else if (task && task === TASK_RESULT) {
      // hand over deliveries reports
      const delivered = _.get(body, 'message_result');
      options.onDelivered(delivered, (error /* , result */) => {
        // pass error to error handler middleware
        if (error && !options.error) {
          next(error);
        }

        // handle error
        else if (error && options.error) {
          // obtain error message
          const message = error.message || 'Fail to process delivery reports';

          // prepare smsync error response
          const reply = {
            payload: {
              success: false,
              error: message,
            },
          };

          // respond with error
          response.ok(reply);
        }

        // handle success
        else {
          // prepare smsync success response for delivery report
          // TODO check for smssync specific format
          const reply = {
            payload: {
              success: true,
              error: null,
            },
          };

          response.ok(reply);
        }
      });
    }

    // receive sms and hand over to a message receiver
    else {
      // extend body with sms hash for only valid allowed smssync field
      body = _.pick(body, MESSAGE_FIELDS);
      body = _.merge({}, body, {
        hash: hash(body),
      });

      options.onReceive(body, (error, result) => {
        // check if receive provide a reply
        const hasReply = _.size(_.compact(_.map([].concat(result), 'to'))) > 0;

        // pass error to error handler middleware
        if (error && !options.error) {
          next(error);
        }

        // handle error
        else if (error && options.error) {
          // obtain error message
          const message = error.message || 'Fail to process received message';

          // prepare smsync error response
          const reply = {
            payload: {
              success: false,
              error: message,
            },
          };

          // respond with error
          response.ok(reply);
        }

        // handle success
        else {
          // prepare smsync success response
          const reply = {
            payload: {
              success: true,
              error: null,
            },
          };

          // check if smsync endpoint is configure to reply with sms
          if (options.reply && hasReply) {
            delete reply.payload.error;

            // update reply with reply message(s)
            reply.payload.task = TASK_SEND;

            // prepare reply messages
            const messages = [].concat(result);
            reply.payload.messages = messages;
          }

          // respond with success
          response.ok(reply);
        }
      });
    }
  });

  /**
   * @description Handle Http GET on /smssync
   *
   * @description provide smssync with sms to send
   * @param  {object} request  a http request
   * @param  {object} response a http response
   * @param {Function} next next middleware to invoke incase of error
   */
  router.get(`/${options.endpoint}`, (request, response, next) => {
    // obtain request task
    const { task } = request.query || {};

    // handle result task and respond with sms waiting
    // delivery report
    if (task && task === TASK_RESULT) {
      // obtain sms waiting delivery report
      options.onQueued((error, result) => {
        // prepare wait delivery reply
        const reply = {
          message_uuids: [].concat(result),
        };

        response.ok(reply);
      });
    }

    // reply with sms to send
    else {
      // obtain sms to send
      options.onSend((error, result) => {
        // pass error to error handler middleware
        if (error && !options.error) {
          next(error);
        }

        // handle error
        else if (error && options.error) {
          // obtain error message
          const message = error.message || 'Fail to obtain message to send';

          // prepare smsync error response
          const reply = {
            payload: {
              success: false,
              error: message,
            },
          };

          // respond with error
          response.ok(reply);
        }

        // handle success
        else {
          // prepare sms to send reply
          const reply = {
            payload: {
              task: TASK_SEND,
              secret: options.secret,
              messages: [].concat(result),
            },
          };

          response.ok(reply);
        }
      });
    }
  });

  return router;
};
