// server.js

// set up ======================================================================
// get all the tools we need
var express  = require('express');
var app      = express();
var port     = process.env.PORT || 8080;
var passport = require('passport');
var flash    = require('connect-flash');

var morgan       = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser   = require('body-parser');
var session      = require('express-session');

var sqlite3 = require('sqlite3').verbose();
var db;

var configDB = require('./config/database.js');
var conn_str = configDB.dbPath;
var serverDBPath = configDB.serverDBPath;
var serverDB;

var fs = require('fs');
var https = require('https');
var options = {
    key: fs.readFileSync('./ssl/server.key'),
    cert: fs.readFileSync('./ssl/server.crt'),
    ca: fs.readFileSync('./ssl/ca.crt'),
    requestCert: true,
    rejectUnauthorized: false
};

app.use(express.static(__dirname + '/public'));

require('./config/passport')(passport); // pass passport for configuration

// global map for saving user -> connection
var connMap = {};

var ws = require('nodejs-websocket');
var property = {
  secure:true,
  key: fs.readFileSync('./ssl/server.key'),
  cert: fs.readFileSync('./ssl/server.crt'),
  ca: fs.readFileSync('./ssl/ca.crt'),
  requestCert: true,
  rejectUnauthorized: false
};
var server = ws.createServer(property, function (conn) {
    console.log("New connection requested to: " + conn.path);
    console.log(conn.path);
    // simple userID, anything after '/'
    // should use database here
    var userID = conn.path.substring(1);
    conn.on("close", function (code, reason) {
        console.log("Connection closed")
    });
    // connMap[userID] = conn;
    connMap['Lehao'] = conn;
    console.log(connMap);
}).listen(9000);

// set up our express application
app.use(morgan('dev')); // log every request to the console
app.use(cookieParser()); // read cookies (needed for auth)
app.use(bodyParser()); // get information from html forms

app.set('view engine', 'ejs'); // set up ejs for templating

// required for passport
app.use(session({ secret: 'herehereherehrehrerherherherherherherherhe' })); // session secret
app.use(passport.initialize());
app.use(passport.session()); // persistent login sessions
app.use(flash()); // use connect-flash for flash messages stored in session

// routes ======================================================================
require('./app/routes.js')(app, passport); // load our routes and pass in our app and fully configured passport

// launch ======================================================================
db = new sqlite3.Database(conn_str);
db.serialize(function() {
  db.run('CREATE TABLE  IF NOT EXISTS users ( id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, password TEXT );');
  db.run('CREATE TABLE  IF NOT EXISTS devices (PeerID TEXT, serv_state INTEGER, PeerInfo TEXT, Noob TEXT, Hoob TEXT, Hint TEXT,errorCode INTEGER ,UserName TEXT, PRIMARY KEY (PeerID, UserName));');

  db.close();
});

// create database for non-authentification purpose
serverDB = new sqlite3.Database(serverDBPath);
serverDB.serialize(function() {
  serverDB.run('create table if not exists User \
    (UserID integer primary key autoincrement, \
    UserName text, \
    Password text);');

  serverDB.run('create table if not exists Device \
    (DeviceID integer primary key autoincrement, \
    DeviceName text, \
    DeviceState text, \
    Description text, \
    UserID integer, \
    Image text);');

  serverDB.run('create table if not exists Notification \
    (NotificationID integer primary key autoincrement, \
    UserID integer, \
    DeviceID integer, \
    Timestamp integer, \
    NotificationType text, \
    Description text);');

  serverDB.run('create table if not exists ContentList \
    (ContentID integer primary key autoincrement, \
    ContentName text, \
    ContentType text, \
    ContentURL text, \
    Source text, \
    UserID integer\
    );');

  serverDB.close();
});

function base64_encode(file) {
    // read binary data
    var bitmap = fs.readFileSync(file);
    // convert binary data to base64 encoded string
    return new Buffer(bitmap).toString('base64');
}


app.get('/control', function(req, res) {
    var query = req._parsedUrl.query;
    var parts = query.split('&');
    var userID;
    var deviceID;
    var contentType;
    var url;
    var source;
    var action;
    var tmpParts;

    tmpParts = parts[0].split('=');
    userID = tmpParts[1];
    tmpParts = parts[1].split('=');
    deviceID = parseInt(tmpParts[1]);
    tmpParts = parts[2].split('=');
    contentType = tmpParts[1];
    var pivot = parts[3].indexOf("=");
    url = parts[3].substring(pivot + 1);
    tmpParts = parts[4].split('=');
    source = tmpParts[1];
    tmpParts = parts[5].split('=');
    action = tmpParts[1];

    var softwareName = 'Text File';
    var softwareList = [];

    var content = base64_encode('file.txt');

    var jsonData = {
        'type': contentType,
        'action': action,
        'url': url,
        'source': source,
        'software_list': softwareList,
        'content': content,
        'software_name': softwareName
    };
    
    // connMap[deviceID].send(JSON.stringify(jsonData));
    connMap['Lehao'].send(JSON.stringify(jsonData));
    res.json({'status': 'success'});
});

https.createServer(options, app).listen(8080, function () {
   console.log('Started!');
});


//app.listen(port);

console.log('App is running on port ' + port);
