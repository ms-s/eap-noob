// server.js

// set up ======================================================================
// get all the tools we need
var common = require('./common');
var connMap = common.connMap;

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

var WebSocketServer = require('ws').Server;
var ws = require('nodejs-websocket')

app.use(express.static(__dirname + '/public'));

require('./config/passport')(passport); // pass passport for configuration

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
    var connectionID = conn.path.substring(1);
    conn.on('close', function (code, reason) {
        console.log("Connection closed");
    });

    // parse received text
    conn.on('text', function(str) {
        console.log('websocket on text');
        msg = JSON.parse(str);
        if (msg['Type'] == 'Metadata') {
            console.log('Type == Metadata');
            console.log(msg);

            var deviceName = msg['DeviceName'];
            var deviceType = msg['DeviceType'];
            var updateSource = msg['UpdateSource'];
            var deviceDescription = msg['DeviceDescription'];
            // need to update database according to deviceID
            var deviceID;
            serverDB = new sqlite3.Database(serverDBPath);
            serverDB.get('select DeviceID from Device where ConnectionID = ?', connectionID, function(err, row) {
                deviceID = row.DeviceID;
                serverDB.serialize(function() {
                    var stmt = serverDB.prepare("UPDATE Device SET DeviceName = ?, DeviceType = ?, SoftwareUpdateURL = ?, Description = ? WHERE DeviceID = ?");
                    stmt.run(deviceName, deviceType, updateSource, deviceDescription, deviceID);
                    stmt.finalize();
                    serverDB.close();
                });
            });
        } else if (msg['Type'] == 'ContentList') {
            console.log('Type == ContentList');
            console.log(msg);

            serverDB = new sqlite3.Database(serverDBPath);
            console.log('initialize serverDB');
            var contentList = msg['ContentList'];
            var deviceID;
            var userID;
            console.log('ready to run server');
            serverDB.get('select DeviceID, UserID from Device where ConnectionID = ?', connectionID, function(err, row) {
                console.log('serverDB Error: ' + err);
                deviceID = row.DeviceID;
                userID = row.UserID;

                // serverDB.serialize(function() {
                //     var stmt = serverDB.prepare('insert into ContentList (ContentName, ContentType, ContentURL, Source, UserID) \
                //         values(?, ?, ?, ?, ?)');
                //     for (index in contentList) {
                //         var content = contentList[index];
                //         stmt.run(content['ContentName'], content['ContentType'], content['ContentURL'], content['Source'], userID);
                //     }
                //     stmt.finalize();
                // })

                for (index in contentList) {
                    var content = contentList[index];
                    serverDB.run('insert into ContentList (ContentName, ContentType, ContentURL, Source, UserID) \
                        values(?, ?, ?, ?, ?)',
                        content['ContentName'], content['ContentType'], content['ContentURL'], content['Source'], userID,
                        function(err, row){

                    });
                }
            });
            serverDB.close();
        } else {
            console.log("Unknown message" + str);
        }
    });

    var deviceID;
    serverDB = new sqlite3.Database(serverDBPath);
    serverDB.get('select DeviceID from Device where ConnectionID = ?', connectionID, function(err, row) {
        console.log('ERROR: ' + err);
        deviceID = row.DeviceID;
        console.log('DeviceID: ' + deviceID);
        if (!err) {
            if (deviceID != undefined) {
                connMap[deviceID] = conn;
            }
        }
    });

    connMap['Lehao'] = conn;
    // console.log(connMap);
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
    ConnectionID text, \
    DeviceName text, \
    DeviceState text, \
    Description text, \
    DeviceType text, \
    SoftwareUpdateURL text, \
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


app.post('/control', function(req, res) {
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

    // var content = base64_encode('file.txt');
    var content;

    var jsonData = {
        'type': contentType,
        'action': action,
        'url': url,
        'source': source,
        'software_list': softwareList,
        'content': content,
        'software_name': softwareName
    };
    
    console.log('Ready to send control json');
    console.log(jsonData);

    connMap[deviceID].send(JSON.stringify(jsonData));
    // connMap['Lehao'].send(JSON.stringify(jsonData));
    res.json({'status': 'success'});
});

https.createServer(options, app).listen(8080, function () {
   console.log('Started!');
});

console.log('App is running on port ' + port);

//db = new sqlite3.Database(conn_str);
//db.each("SELECT PeerID,kz from peers_connected", function(err, row) {
//    console.log(row.PeerID + ":" + row.kz);
//    if (row.PeerID == "k9aGQCEIrjVZYNwXGOk43Y0pMx7AI2j09rFX3jEtBxqzkUuZGO3KL39xze7f") {
//	console.log("ok");
//    }	
//});
