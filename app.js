const bodyParser = require('body-parser');
const compression = require('compression');
const getConfig = require("./config");
const cookieParser = require('cookie-parser');
const cors = require('cors');
const express = require("express");
const { getApiRoutes } = require('./routes');
const helmet = require('helmet');
const Logger = require("./utils/logger");
const path = require("path");
const RateLimit = require('express-rate-limit');
const Searcher = require("./services/searcher");
const ElasticsearchSearcherAdapter = require("./utils/search_adapters/elasticsearch_adapter");
const swaggerUi = require('swagger-ui-express');

/* eslint-disable */
const pug = require("pug");
const favicon = require('serve-favicon');
/* eslint-enable */

/* ------------------------------------------------------------------ *
                            API CONFIG
 * ------------------------------------------------------------------ */
const logger = new Logger({name: "code-gov-api"});

const config = getConfig(process.env.NODE_ENV);

const app = express();

app.set('json escape', true);

if( config.USE_RATE_LIMITER) {
  const limiter = new RateLimit({
    windowMs: parseInt(process.env.WINDOW_MS || 60000, 10),
    max: parseInt(process.env.MAX_IP_REQUESTS || 500, 10),
    delayMs:parseInt(process.env.DELAY_MS || 0, 10),
    headers: true
  });
  app.use(limiter);
}

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use('/', express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(helmet());
app.use(helmet.hsts({
  maxAge: config.HSTS_MAX_AGE,
  preload: config.HSTS_PRELOAD,
  setIf: function() {
    return config.USE_HSTS;
  }
}));

app.use(compression());

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(config.SWAGGER_DOCUMENT));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');
app.set('json spaces', 2);

/* ------------------------------------------------------------------ *
                            API ROUTES
 * ------------------------------------------------------------------ */
const searcherAdapter = new ElasticsearchSearcherAdapter(config);
const searcher = new Searcher(searcherAdapter, config);
const router = getApiRoutes(config, searcher, new express.Router());
app.use('/api', router);

/* ------------------------------------------------------------------ *
                            ERROR HANDLING
 * ------------------------------------------------------------------ */

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  let err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// development error handler (prints stacktrace)
if (app.get('env') === 'development') {
  app.use(function(err, req, res) {
    res.status(err.status || 500);
    logger.error(err);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler (prints generic error message)
app.use(function(err, req, res) {
  res.status(err.status || 500);
  logger.error(err);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

/* ------------------------------------------------------------------ *
                            SERVER
 * ------------------------------------------------------------------ */

// start the server, but only if we're not in the middle of a test
if(!module.parent) {
  if(config.prod_envs.includes(process.env.NODE_ENV)) {
    require('newrelic');
  }

  app.listen(config.PORT, () => logger.info(`Started API server at http://0.0.0.0:${config.PORT}/`));
}

module.exports = app;
