const fs                  = require("fs");
const path                = require("path");
const request             = require("request");
const async               = require("async");
const _                   = require("lodash");
const Writable            = require("stream").Writable;
const Transform           = require("stream").Transform;
const JSONStream          = require("JSONStream");
const moment              = require("moment");

const AbstractIndexer     = require("../abstract_indexer");

const ES_MAPPING = require("../../../indexes/repo/mapping.json");
const ES_SETTINGS = require("../../../indexes/repo/settings.json");
const ES_PARAMS = {
  "esAlias": "repos",
  "esType": "repo",
  "esMapping": ES_MAPPING,
  "esSettings": ES_SETTINGS
};

/* begin get events */
function getevents(gitrepository){
  var eventsurl,returnevents, eventsfeed,eventsinventory,body, eventsfeed_header,eventsfeed_start,
      eventsfeed_projects,eventsfeed_updated, eventsfeed, limit, stuff;
  
  limit = 6;
  if (!gitrepository.includes("github.com")){
    return "";
  }
  eventsurl = gitrepository.replace("git://github.com/","https://api.github.com/repos/");
 
  eventsurl = eventsurl.substr(0, eventsurl.length-4);
  eventsurl+="/events";
  console.log("eventsurl: "+eventsurl); 
  //console.log(eventsurl+"?client_id="+process.env.CLIENTID+"&client_secret="+process.env.CLIENTSECRET);
  var options = {
  url: eventsurl+"?client_id="+process.env.CLIENTID+"&client_secret="+process.env.CLIENTSECRET,
  headers: {
    'User-Agent': 'request',
    'Accept': 'application/vnd.github.full+json'
    
  }
    
  
};
  


   
   
  function callback(error, response, body)
{
  //console.log("length: "+body.length);
  
    eventsinventory = JSON.parse(body);
  
    if (eventsinventory==undefined){ 
      eventsinventory = JSON.parse(body);
    }
  
   eventsfeed_projects = '';
    eventsfeed_updated='';
   eventsfeed_header ="export const EVENTS = ";
    eventsfeed_start = "[";
  if (eventsinventory[0]==undefined) {return "";}
console.log("first type:"+eventsinventory[0].type);
    for (var i = 0; i < Math.min(limit,eventsinventory.length); i++) {
      

      eventsfeed_projects +=
        "{\"id\": \""+eventsinventory[i].repo.id +"\",\"name\": \"" + eventsinventory[i].repo.name + "\",\"type\":\"" +
        (eventsinventory[i].type).replace("Event","") + "\",\"user\":\"" + eventsinventory[i].actor.display_login +
        "\",\"time\": \"" + eventsinventory[i].created_at +"\"";

      //loop through type of event
      if (eventsinventory[i].type == "PushEvent")

      {
        
          eventsfeed_projects += ",\"message\": \""+eventsinventory[i].payload.commits[0].message+"\", \"url\":\""+eventsinventory[i].payload.commits[0].url+"\"";


       
      }
      else if (eventsinventory[i].type == "PullRequestEvent")

      {
        
          eventsfeed_projects += ",\"message\": \""+eventsinventory[i].payload.pull_request.title+"\", \"url\":\""+eventsinventory[i].payload.pull_request.url+"\"";


       
      }
      else if (eventsinventory[i].type == "IssueCommentEvent")

      {
        
          eventsfeed_projects += ",\"message\": \""+eventsinventory[i].payload.issue.title+"\", \"url\":\""+eventsinventory[i].payload.issue.url+"\"";
       
      }
eventsfeed_projects += "}";
      
        if (i + 1 < Math.min(limit,eventsinventory.length)) {
        eventsfeed_projects += ',';
      }
    }
      
    eventsfeed = eventsfeed_start + eventsfeed_projects + ']';
  
  
  return eventsinventory;
}
  request(options, callback);

  
  console.log(eventsfeed);
return eventsfeed;
}
/* end get events */

/* begin get repoURL */
function getrepoURL(gitrepository){
  var repoURL;
  
  if (!gitrepository.includes("github.com")){
    return "";
  }
  repoURL = gitrepository.replace("git://","https://");
 
  repoURL = repoURL.substr(0, repoURL.length-4);
  
  
  
return repoURL;
}
/* end get repoURL */





class AgencyJsonStream extends Transform {

  constructor(repoIndexer) {
    super({objectMode: true});
    this.repoIndexer = repoIndexer;
    this.logger = repoIndexer.logger;
  }

  _fetchAgencyReposRemote(agencyUrl, callback) {
    this.logger.info(`Fetching remote agency repos from ${agencyUrl}...`);

    request(agencyUrl, (err, response, body) => {
      if (err) {
        this.logger.error(err);
        return callback(null, {});
      }

      let agencyData = JSON.parse(body);
      return callback(null, agencyData);
    });
  }

  _fetchAgencyReposLocal(agencyUrl, callback) {
    const filePath = path.join(__dirname, "../../..", agencyUrl);
    this.logger.info(`Fetching local agency repos from ${filePath}...`);

    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        this.logger.error(err);
        return callback(null, {});
      }

      // TODO: potentially use streams? file might be too large
      let agencyData = JSON.parse(data);
      return callback(null, agencyData);
    });
  }

  _fetchAgencyRepos(agencyUrl, next) {
    this.logger.info(agencyUrl);

    const _processAgencyData = (err, agencyData) => {
      if (agencyData.projects && agencyData.projects.length) {
        agencyData.projects.forEach((project) => {
          project.agency = agencyData.agency;
          //console.log("repository is: "+project.repository)
          project.repoURL = getrepoURL(project.repository);
         // project.events = getevents(project.repository);
          
          
          this.push(project);
        });
      }

      return next();
    };

    // Crude detection of whether the url is a remote or local reference.
    // If remote, make a request, otherwise, read the file.
    if (agencyUrl.substring(0, 5) === "http") {
      this._fetchAgencyReposRemote(agencyUrl, _processAgencyData);
    } else {
      this._fetchAgencyReposLocal(agencyUrl, _processAgencyData);
    }
  }

  _transform(agency, enc, next) {
    this._fetchAgencyRepos(agency.repos_url, next);
  }

}

class AgencyRepoIndexerStream extends Writable {

  constructor(repoIndexer) {
    super({objectMode: true});
    this.repoIndexer = repoIndexer;
    this.logger = repoIndexer.logger;
  }

  _indexRepo(repo, done) {
    this.logger.info(
      `Indexing repository (${repo.repository}).`);

    this.repoIndexer.indexDocument({
      "index": this.repoIndexer.esIndex,
      "type": this.repoIndexer.esType,
      "id": repo.repoID,
      "body": repo
    }, (err, response, status) => {
      if(err) { this.logger.error(err); }
      this.repoIndexer.indexCounter++;

      return done(err, response);
    });
  }

  _write(repo, enc, next) {
    this._indexRepo(repo, (err, response) => {
      return next(null, response);
    });
  }
}

class RepoIndexer extends AbstractIndexer {

  get LOGGER_NAME() {
    return "repo-indexer";
  }

  constructor(adapter, agencyEndpointsFile, params) {
    super(adapter, params);
    this.indexCounter = 0;
    this.agencyEndpointsFile = agencyEndpointsFile;
  }

  indexRepos(callback) {
    let rs = fs.createReadStream(this.agencyEndpointsFile);
    let js = JSONStream.parse("*");
    let as = new AgencyJsonStream(this);
    let is = new AgencyRepoIndexerStream(this);

    rs.pipe(js).pipe(as).pipe(is).on("finish", () => {
      this.logger.info(`Indexed ${this.indexCounter} ${this.esType} documents.`);
      callback();
    });
  }

  static init(adapter, agencyEndpointsFile, callback) {
    let indexer = new RepoIndexer(adapter, agencyEndpointsFile, ES_PARAMS);
    indexer.logger.info(`Started indexing (${indexer.esType}) indices.`);
    async.waterfall([
      (next) => { indexer.indexExists(next); },
      (exists, next) => {
        if(exists) {
          indexer.deleteIndex(next)
        } else {
          next(null, null);
        }
      },
      (response, next) => { indexer.initIndex(next); },
      (response, next) => { indexer.initMapping(next); },
      (response, next) => { indexer.indexRepos(next); }
    ], (err) => {
      if(err) { indexer.logger.error(err); }
      indexer.logger.info(`Finished indexing (${indexer.esType}) indices.`);
      return callback(err,{
        esIndex: indexer.esIndex,
        esAlias: indexer.esAlias
      });
    });
  }

}

module.exports = RepoIndexer;
