/******************************************************************************

  REPORTER: a service which tracks the status of fetching/indexing and writes
  a report as a result

******************************************************************************/

const _                   = require("lodash");
const fs                  = require("fs");
const path                = require("path");
const Jsonfile            = require("jsonfile");
const Utils               = require("../../utils");
const Logger              = require("../../utils/logger");
const config              = require("../../config");

class Reporter {

  constructor() {
    this.logger = new Logger({ name: "reporter" });

    this.report = {
      timestamp: (new Date()).toString(),
      statuses: {}
    };
  }

  _createReportItemIfDoesntExist(itemName) {
    // creates the report item if it doesn't already exist
    if (this.report.statuses[itemName] === undefined) {
      this.report.statuses[itemName] = {
        status: "",
        issues: [],
        schemaVersion: "",
        category: "",
        metadata: {}
      };
    }
  }

  reportStatus(itemName, status) {
    this._createReportItemIfDoesntExist(itemName);
    this.report.statuses[itemName]["status"] = status;
  }

  reportIssues(itemName, issuesObj) {
    this._createReportItemIfDoesntExist(itemName);
    this.report.statuses[itemName]["issues"].push(issuesObj);
  }


  reportSchemaVersion(itemName, schemaVersion) {
    this._createReportItemIfDoesntExist(itemName);
    this.report.statuses[itemName]["schemaVersion"] = schemaVersion;
  }


  reportCategory(itemName, category) {
    this._createReportItemIfDoesntExist(itemName);
    this.report.statuses[itemName]["category"] = category;
  }


  reportMetadata(itemName, metadata) {
    this._createReportItemIfDoesntExist(itemName);
    this.report.statuses[itemName]["metadata"] = metadata;
  }

  writeReportToFile(callback) {
    this.logger.info("Writing report to file...");
    const reportFilepath = path.join(
      __dirname,
      "../../",
      config.REPORT_FILEPATH
    );
    Jsonfile.writeFile(reportFilepath, this.report, (err) => {
      if (err) {
        this.logger.error(err);
      }
      return callback(err);
    })
  }

}

module.exports = new Reporter();
