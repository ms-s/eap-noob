// app/routes.js
var common = require('../common');
var connMap = common.connMap;
var GlobalDeviceID = 0;

var fs = require('fs');

function base64_encode(file) {
    // read binary data
    var bitmap = fs.readFileSync(file);
    // convert binary data to base64 encoded string
    return new Buffer(bitmap).toString('base64');
}

var base64url = require('base64url');
var crypto = require('crypto');
var sqlite3 = require('sqlite3').verbose();
var db;

var configDB = require('../config/database.js');
var conn_str = configDB.dbPath;

var serverDBPath = configDB.serverDBPath;
var serverDB;

var PythonShell = require('python-shell');

var url = require('url');
var state_array = ['Unregistered','OOB Waiting', 'OOB Received' ,'Reconnect Exchange', 'Registered'];
var error_info = [ "No error",
"Invalid NAI or peer state",
"Invalid message structure",
"Invalid data",
"Unexpected message type",
"Unexpected peer identifier",
"Invalid ECDH key",
"Unwanted peer",
"State mismatch, user action required",
"No mutually supported protocol version",
"No mutually supported cryptosuite",
"No mutually supported OOB direction",
"MAC verification failure"];
module.exports = function(app, passport) {

    // =====================================
    // HOME PAGE (with login links) ========
    // =====================================
    app.get('/', function(req, res) {
        console.log('GET /');
        //res.render('qr_scanner.ejs');

        res.render('login.ejs', { message: req.flash('loginMessage')}); // load the index.ejs file
    });

    // =====================================
    // LOGIN ===============================
    // =====================================
    app.get('/login', function(req, res) {
    console.log('GET /login');
    // render the page and pass in any flash data if it exists
    res.render('login.ejs', { message: req.flash('loginMessage')}); 
});

    
    // app.get('/getDevices', isLoggedIn, function(req, res) {
    //     console.log('GET /getDevices');

    //     var device_info = req.query.DeviceInfo;
    //     var queryObject = url.parse(req.url,true).query;
    //     var len = Object.keys(queryObject).length;

    //     if(len != 1 || device_info == undefined)
    //     {
    //         console.log("Its wrong Query");
    //         res.json({"error":"Wrong Query."});
    //     }else{
    //         var deviceDetails = new Array();
    //         var i= 0;
    //         var parseJson;
    //         var devInfoParam = '%' + device_info + '%';
    //         db = new sqlite3.Database(conn_str);
    //         db.all('SELECT PeerID, PeerInfo FROM peers_connected where peerInfo LIKE ? AND serv_state = ? AND userName IS NULL', devInfoParam, 1, function(err,rows){ //check for error conditions too
    //             db.close();
    //             if(!err){
    //                 rows.forEach(function(row) {
    //                     deviceDetails[i] = new Object();
    //                     deviceDetails[i].peer_id = row.PeerID;
    //                     parseJson= JSON.parse(row.PeerInfo);
    //                     deviceDetails[i].peer_name = parseJson['PeerName'];
    //                     deviceDetails[i].peer_num = parseJson['PeerSNum'];
    //                     deviceDetails[i].peer_ssid = parseJson['PeerSSID'];
    //                     deviceDetails[i].peer_bssid = parseJson['PeerBSSID'];
                        
    //                     i++;
    //                 });
    //                 console.log(JSON.stringify(deviceDetails)); 
    //                 res.send(JSON.stringify(deviceDetails));
    //             }else{
    //                 res.send(JSON.stringify(deviceDetails));
                    
    //             }
    //         });
    //     }
    // });

    app.get('/devices', isLoggedIn, function(req, res) {
        var query = req._parsedUrl.query;
        console.log('GET /devices');
        console.log('query: ' + query);

        var parts = query.split('=');
        var userID = parseInt(parts[1]);
        var userName;

        serverDB = new sqlite3.Database(serverDBPath);
        var deviceList = [];

        serverDB.get('select UserName from User where UserID = ?', userID, function(err, userRow) {
            if (!err && userRow != undefined) {
                userName = userRow.UserName;
                serverDB.all('select D.DeviceID, D.DeviceName, D.DeviceState, D.Description, D.Image \
                from Device as D, AuthorizedUser as A \
                where D.DeviceID = A.DeviceID and A.UserID = ?', userID, function(err, rows) {
                    if (!err) {
                        rows.forEach(function(row) {
                            deviceList.push({
                                DeviceID: row.DeviceID, 
                                DeviceName: row.DeviceName,
                                DeviceState: row.DeviceState,
                                Description: row.Description,
                                Image: row.Image
                            });
                            console.log('DeviceName: ' + row.DeviceName);
                            console.log('DeviceImage: ' + row.Image);
                        });
                    } else {
                        console.log('ERROR: join query in /devices')
                    }
                    res.render('devices.ejs', {
                        UserID: userID,
                        UserName: userName,
                        Devices: deviceList
                    });
                });
            } else {
                res.render('devices.ejs', {
                    UserID: userID,
                    UserName: userName,
                    Devices: deviceList
                });
            }
        });

        serverDB.close();
    });

    app.get('/device', isLoggedIn, function(req, res){
        var query = req._parsedUrl.query;
        console.log('GET /device');
        console.log('query: ' + query);

        var parts = query.split('&');
        var tmpParts = parts[0].split('=');
        var deviceID = parseInt(tmpParts[1]);
        tmpParts = parts[1].split('=');
        var userID = parseInt(tmpParts[1]);

        var deviceName = 'Error';
        var deviceState = 'N/A';
        var description = 'N/A';
        var image = 'N/A';
        var notificationList = [];
        var contentList = [];
        var deviceType = 'N/A';
        var permission = -1;

        serverDB = new sqlite3.Database(serverDBPath);
        serverDB.get('select DeviceName, DeviceState, Description, DeviceType, Image from Device where DeviceID = ?', deviceID, function(err, deviceRow) {
            if (!err && deviceRow != undefined) {
                deviceName = deviceRow.DeviceName;
                deviceState = deviceRow.DeviceState;
                description = deviceRow.Description;
                deviceType = deviceRow.DeviceType;
                image = deviceRow.Image;

                serverDB.get('select Permission from AuthorizedUser where DeviceID = ? and UserID = ?', deviceID, userID, function(err, permissionRow){
                    if (!err && permissionRow != undefined) {
                        permission = permissionRow.Permission;

                        serverDB.all('select NotificationID, NotificationType, Description from Notification where DeviceID = ?', deviceID, function(err, notificationRows) {
                            if (!err) {
                                notificationRows.forEach(function(row) {
                                    notificationList.push({
                                        NotificationID: row.NotificationID,
                                        NotificationType: row.NotificationType,
                                        Description: row.Description
                                    });
                                });
                            }

                            if (deviceType == 'Video') {
                                res.render('display.ejs', {
                                    DeviceID: deviceID,
                                    UserID: userID,
                                    DeviceName: deviceName,
                                    DeviceState: deviceState,
                                    Description: description,
                                    Image: image,
                                    NotificationList: notificationList,
                                    ContentList: contentList,
                                    Permission: permission
                                });
                            } else if (deviceType == 'Audio') {
                                res.render('speaker.ejs', {
                                    DeviceID: deviceID,
                                    UserID: userID,
                                    DeviceName: deviceName,
                                    DeviceState: deviceState,
                                    Description: description,
                                    Image: image,
                                    NotificationList: notificationList,
                                    ContentList: contentList,
                                    Permission: permission
                                });
                            } else {
                                console.log('Invalid DeviceType: ' + deviceType);
                                res.send('Invalid DeviceType');
                            }
                        });
                    } else {
                        console.log('Error: Get permission in /device; error: ' + err);
                    }
                });
            } else {
                console.log('ERROR: select DeviceName, DeviceState, Description, DeviceType, Image in /device');
            }
            serverDB.close();
        });
    });

 //    app.get('/insertDevice', function(req, res) {
 //        console.log('GET /insertDevice');

 //        var peer_id = req.query.PeerId;
 //        var queryObject = url.parse(req.url,true).query;
 //        var len = Object.keys(queryObject).length;

 //        if(len != 1 || peer_id == undefined)
 //        {
 //         res.json({"status":"failed"});
 //     }else{
 //         console.log('req received');

 //         db = new sqlite3.Database(conn_str);
 //         serverDB = new sqlite3.Database(serverDBPath);
 //         db.get('SELECT count(*) AS rowCount, PeerID, serv_state, PeerInfo, errorCode FROM peers_connected WHERE PeerID = ?', peer_id, function(err, row) {

 //            if (err){res.json({"status": "failed"});}
 //            else if(row.rowCount != 1) {console.log(row.length);res.json({"status": "refresh"});}
 //            else {

 //                var options = {
 //                    mode: 'text',
 //                    pythonPath: '/usr/bin/python',
 //                    pythonOptions: ['-u'],
 //                    scriptPath: configDB.ooblibPath,
 //                    args: ['-o', peer_id]
 //                };
 //                var parseJ;
 //                PythonShell.run('oobmessage.py', options, function (err,results) {
 //                    if (err){console.log("results : ",results); res.json({"status": "failed"});}
 //                    else{
 //                        parseJ = JSON.parse(results);
 //                        var noob = parseJ['noob'];
 //                        var hoob = parseJ['hoob'];
 //                        var hash = crypto.createHash('sha256');
 //                        var hash_str = noob+'AFARMERLIVEDUNDERTHEMOUNTAINANDGREWTURNIPSFORALIVING'
 //                    hash.update(hash_str);
 //                    var hint =  base64url.encode(hash.digest());

 //                    serverDB.get('select UserID from User where UserName = ?', req.user.username, function(err, userRow) {
 //                        serverDB.run('insert into Device (DeviceID, DeviceName, DeviceState, Description, Image) \
 //                        values(?, ?, ?, ?, ?, ?)',
 //                        peer_id, 'Device Name', 'Device State', userRow.PeerInfo, 'Image',
 //                        function(err, row) {
 //                            if (!err) {
 //                                serverDB.run('insert into AuthorizedUser (DeviceID, UserID, Permission) values(?, ?, ?)',
 //                                    peer_id, userRow.UserID, 0, function(err, row) {

 //                                    });
 //                            }
 //                        });
 //                    });
 //                    serverDB.close();

 //                    db.get('INSERT INTO devices (PeerID, serv_state, PeerInfo, Noob, Hoob,Hint,errorCode, username) values(?,?,?,?,?,?,?,?)', peer_id, row.serv_state, row.PeerInfo, noob, hoob, hint.slice(0,32),0, req.user.username, function(err, row) {
 //                        db.close();
 //                        if (err){console.log(err);res.json({"status": "failed"});}
 //                        else {res.json({"status": "success"});}
 //                    });
 //                }
 //            });
 //            }
 //        });

 //     }
 // });

    app.get('/python', function(req, res) {
        console.log('GET /python');
        // render the page and pass in any flash data if it exists
        var parseJ;
        PythonShell.run('oobmessage.py', options, function (err,results) {
            if (err) console.log (err);
            res.send("Its Successful");
        //parseJ = JSON.parse(results);
        console.log('results:', results);
    });
    });


    // =====================================
    // SIGNUP ==============================
    // =====================================
    app.get('/signup', function(req, res) {
        console.log('GET /signup');

        res.render('signup.ejs', { message: req.flash('signupMessage') });
    });


 //    =====================================
 //    PROFILE SECTION =====================
 //    =====================================
    app.get('/contentList', isLoggedIn, function(req, res) {
        serverDB = new sqlite3.Database(serverDBPath);
        var query = req._parsedUrl.query;
        console.log('GET /contentList');
        console.log('query: ' + query);

        var parts = query.split('&');
        var tmpParts = parts[0].split('=');
        var userID = parseInt(tmpParts[1]);
        tmpParts = parts[1].split('=');
        var contentType = tmpParts[1];
        tmpParts = parts[2].split('=');
        var source = tmpParts[1];
        tmpParts = parts[3].split('=');
        var deviceID = tmpParts[1];

        var deviceName;
        var deviceState;
        var description;
        var deviceType;
        var image;
        var notificationList = [];
        var contentList = [];

        serverDB = new sqlite3.Database(serverDBPath);
        serverDB.get('select DeviceName, DeviceState, Description, Image, DeviceType from Device where DeviceID = ?', deviceID, function(err, deviceRow) {
            if (!err && deviceRow != undefined) {
                deviceName = deviceRow.DeviceName;
                deviceState = deviceRow.DeviceState;
                description = deviceRow.Description;
                deviceType = deviceRow.DeviceType;
                image = deviceRow.Image;
            }

            serverDB.all('select NotificationID, NotificationType, Description from Notification where DeviceID = ?', deviceID, function(err, notificationRows) {
                if (!err) {
                    notificationRows.forEach(function(row) {
                        notificationList.push({
                            NotificationID: row.NotificationID,
                            NotificationType: row.NotificationType,
                            Description: row.Description
                        });
                    });
                }

                serverDB.all('select ContentID, ContentName, ContentURL from ContentList where Source = ?', source,
                function(err, contentRows) {
                    if (!err) {
                        contentRows.forEach(function(contentRow){
                            contentList.push(
                            {
                                ContentID: contentRow.ContentID,
                                ContentName: contentRow.ContentName,
                                URL: contentRow.ContentURL
                            });
                        });

                    }

                    if (deviceType == 'Video') {
                        res.render('display.ejs', {
                            DeviceID: deviceID,
                            UserID: userID,
                            DeviceName: deviceName,
                            DeviceState: deviceState,
                            Description: description,
                            Image: image,
                            NotificationList: notificationList,
                            ContentList: contentList
                        });
                    } else if (deviceType == 'Audio') {
                        res.render('speaker.ejs', {
                            DeviceID: deviceID,
                            UserID: userID,
                            DeviceName: deviceName,
                            DeviceState: deviceState,
                            Description: description,
                            Image: image,
                            NotificationList: notificationList,
                            ContentList: contentList
                        });
                    } else {
                        console.log('Invalid DeviceType');
                        res.send('Invalid DeviceType');
                    }
                });
            })
        });

        serverDB.close();
    });

    app.get('/settings', isLoggedIn, function(req, res) {
        console.log('GET /settings');
        var userName = req.user.username;
        var userID;
        serverDB = new sqlite3.Database(serverDBPath);
        serverDB.get('select UserID from User where UserName = ?', userName, function(err, row){
            if (!err) {
                if (row != undefined) {
                    userID = row.UserID;
                }
            } else {
                console.log('ERROR in /settings: ' + err);
            }
            res.render('settings.ejs',
                    {UserID: userID}
            );
        });
        serverDB.close();
    });

    app.get('/getAudio', isLoggedIn, function(req, res) {
        console.log('GET /getAudio');
        // console.log('Query: ' + req);

        var UserID = parseInt(req.param('UserID'));
        var ContentType = req.param('ContentType');
        var Source = req.param('Source');
        var SourceUserName = req.param('SourceUserName');
        var SourcePassword = req.param('SourcePassword');
        var DeviceID = parseInt(req.param('DeviceID'));
        var contentList = [];
        jsonData = {
            'userID': UserID,
            'type': 'getContent',
            'source_user_name': SourceUserName,
            'source_password': SourcePassword
        };
        console.log('DeviceID: ' + DeviceID);
        console.log('==================== MAP =============');
        // console.log(connMap);
        console.log('LOG: ' + UserID + ' ' + ContentType + ' ' + Source);
        console.log('======================================');
        connMap[DeviceID].send(JSON.stringify(jsonData));

        var k = 0;

        handle = setInterval(function() {
            serverDB = new sqlite3.Database(serverDBPath);
            serverDB.all('select ContentID, ContentName, ContentURL from ContentList where UserID = ? and ContentType = ? and Source = ?',
                UserID, ContentType, Source,
                function(err, rows) {
                    if (!err && rows.length != 0) {
                        rows.forEach(function(row) {
                            contentList.push({
                                'ContentID': row.ContentID,
                                'ContentName': row.ContentName,
                                'URL': row.ContentURL
                            });
                        });
                        clearTimeout(handle);
                        res.send(contentList);
                    } else {
                        console.log('Error or empty rows: ' + err);
                        if (k == 3) {
                            clearTimeout(handle);
                            res.send(contentList);
                        }
                    }
                    k += 1;
                }
            );
            serverDB.close();
        }, 1000);
        // serverDB = new sqlite3.Database(serverDBPath);        
        // // serverDB.all('select UserID from User where UserName = ?', userName, function(err, userRows) {
        // // serverDB.all('select DeviceID, DeviceName, Image, Description from Device where UserID = ?', userID, function(err, deviceRows) {
        // serverDB.all('select ContentID, ContentName, ContentURL from ContentList where UserID = ? and ContentType = ? and Source = ?',
        //     UserID, ContentType, Source,
        //     function(err, rows) {
        //         console.log('/getAudio return values: ' + rows);
        //         if (!err) {
        //             rows.forEach(function(row) {
        //                 contentList.push({
        //                     'ContentID': row.ContentID,
        //                     'ContentName': row.ContentName,
        //                     'URL': row.ContentURL
        //                 });
        //             });
        //         } else {
        //             console.log('Error: ' + err);
        //         }
        //         res.send(contentList);
        //     }
        // );
        // serverDB.close();
    });

    app.get('/profile', isLoggedIn, function(req, res) {
        serverDB = new sqlite3.Database(serverDBPath);
        var userID;
        var userName = req.user.username;

        // console.log(req);

        console.log('GET /profile');
        console.log('userName: ' + userName);

        var notificationList = [];
        var deviceList = [];

        serverDB.get('select UserID from User where UserName = ?', userName, function(err, userRow) {
            if (err) {
                res.render('profile.ejs', {
                    UserID: userID,
                    UserName: userName,
                    NotificationList: notificationList,
                    Devices: deviceList
                });
                serverDB.close();
                return;
            }

            userID = userRow.UserID;

            // TODO, need to first select devices' IDs
            serverDB.all('select N.NotificationID, N.DeviceID, N.NotificationType, N.Description from Notification as N, AuthorizedUser as A \
            where N.DeviceID = A.DeviceID and A.UserID = ?', userID, function(err, notificationRows) {
                if (err) {
                    res.render('profile.ejs', {
                        UserID: userID,
                        UserName: userName,
                        NotificationList: notificationList,
                        Devices: deviceList
                    });
                    serverDB.close();
                    return;
                }
                notificationRows.forEach(function(row) {
                    notificationList.push({
                        NotificationID: row.NotificationID,
                        DeviceID: row.DeviceID,
                        NotificationType: row.NotificationType,
                        Description: row.Description});
                });

                serverDB.all('select D.DeviceID, D.DeviceType, D.DeviceName, D.Image, D.Description from Device as D, AuthorizedUser as A\
                    where D.DeviceID = A.DeviceID and A.UserID = ?', userID, function(err, deviceRows) {
                    if (err) {
                        res.render('profile.ejs', {
                            UserID: userID,
                            UserName: userName,
                            NotificationList: notificationList,
                            Devices: deviceList
                        });
                        serverDB.close();
                        return;
                    }

                    deviceRows.forEach(function(row) {
                        deviceList.push({
                            DeviceID: row.DeviceID,
                            DeviceName: row.DeviceName,
                            Image: row.Image,
                            Description: row.Description});
                    });

                    // successful
                    res.render('profile.ejs', {
                        UserID: userID,
                        UserName: userName,
                        NotificationList: notificationList,
                        Devices: deviceList
                    });

                    serverDB.close();
                    return;
                });
            });
        });
    });

    app.get('/notification', isLoggedIn, function(req, res) {
        serverDB = new sqlite3.Database(serverDBPath);
        var query = req._parsedUrl.query;
        console.log('GET /notification');
        console.log('Query: ' + query);

        var parts = query.split('&');
        var tmpParts;
        var notificationID;
        var action;
        var type;
        var userName = req.user.username;
        var userID;
        var softwareUpdateURL;
        tmpParts = parts[0].split('=');
        notificationID = parseInt(tmpParts[1]);

        tmpParts = parts[1].split('=');
        action = tmpParts[1];

        tmpParts = parts[2].split('=');
        type = tmpParts[1];


        var deviceName;
        var deviceState;
        var description;
        var deviceType;
        var image;
        // var deviceType;
        var notificationList = [];
        var contentList = [];
        var deviceID;

        // TODO, first get UserID from userName
        serverDB.get('select UserID from User where UserName = ?', userName, function(err, userRow) {
            if (!err) {
                if (userRow != undefined) {
                    userID = userRow.UserID;
                } else {
                    console.log('userRow undefined');
                }
            } else {
                console.log('Error in select UserID in /notification: ' + err);
            }
            serverDB.get('select DeviceID from Notification where NotificationID = ?', notificationID, function(err, notificationRow) {
                if (!err && notificationRow != undefined) {
                    deviceID = notificationRow.DeviceID;
                }

                serverDB.get('select DeviceName, DeviceState, SoftwareUpdateURL, Description, DeviceType, Image from Device where DeviceID = ?', deviceID, function(err, deviceRow) {
                    if (!err && deviceRow != undefined) {
                        deviceName = deviceRow.DeviceName;
                        deviceState = deviceRow.DeviceState;
                        description = deviceRow.Description;
                        image = deviceRow.Image;
                        softwareUpdateURL = deviceRow.SoftwareUpdateURL;
                        deviceType = deviceRow.deviceType;
                    }

                    serverDB.all('select NotificationID, NotificationType, Description from Notification where DeviceID = ?', deviceID, function(err, notificationRows) {
                        if (!err) {
                            notificationRows.forEach(function(row) {
                                notificationList.push({
                                    NotificationID: row.NotificationID,
                                    NotificationType: row.NotificationType,
                                    Description: row.Description
                                });
                            });
                        }

                        if (type == 'SoftwareUpdate') {
                            if (action == 'cancel') {
                                // serverDB.all('delete from Notification where NotificationID = ?', notificationID, function(err, row) {
                                // });
                                res.json({'status': 'OK'});
                            } else if (action == 'details') {
                                if (deviceType == 'Video') {
                                    res.render('display.ejs', {
                                        DeviceID: deviceID,
                                        UserID: userID,
                                        DeviceName: deviceName,
                                        DeviceState: deviceState,
                                        Description: description,
                                        Image: image,
                                        NotificationList: notificationList,
                                        ContentList: contentList
                                    });
                                } else if (deviceType == 'Audio') {
                                    res.render('speaker.ejs', {
                                        DeviceID: deviceID,
                                        UserID: userID,
                                        DeviceName: deviceName,
                                        DeviceState: deviceState,
                                        Description: description,
                                        Image: image,
                                        NotificationList: notificationList,
                                        ContentList: contentList
                                    });
                                } else {
                                    console.log('Invalid DeviceType');
                                    res.send('Invalid DeviceType');
                                }
                            } else if (action == 'agree') {
                                // transmit file to client

                                var content = base64_encode(softwareUpdateURL);
                                var jsonData = {
                                    'type': 'update',
                                    'action': undefined,
                                    'url': undefined,
                                    'source': undefined,
                                    'content': content,
                                    'software_name': 'update'
                                };

                                connMap[deviceID].send(JSON.stringify(jsonData));
                                serverDB.all('delete from Notification where NotificationID = ?', notificationID, function(err, row) {
                                });
                                res.json({'status': 'OK'});
                            }
                        } else {
                            // VideoListUpdate / AudioListUpdate
                            if (action == 'cancel') {
                                // serverDB.all('delete from Notification where NotificationID = ?', notificationID, function(err, row) {
                                // });
                                res.json({'status': 'OK'});
                            } else if (action == 'details') {
                                if (deviceType == 'Video') {
                                    res.render('display.ejs', {
                                        DeviceID: deviceID,
                                        UserID: userID,
                                        DeviceName: deviceName,
                                        DeviceState: deviceState,
                                        Description: description,
                                        Image: image,
                                        NotificationList: notificationList,
                                        ContentList: contentList
                                    });
                                } else if (deviceType == 'Audio') {
                                    res.render('speaker.ejs', {
                                        DeviceID: deviceID,
                                        UserID: userID,
                                        DeviceName: deviceName,
                                        DeviceState: deviceState,
                                        Description: description,
                                        Image: image,
                                        NotificationList: notificationList,
                                        ContentList: contentList
                                    });
                                } else {
                                    console.log('Invalid DeviceType');
                                    res.send('Invalid DeviceType');
                                }
                            }
                        }
                    });
                });
            });
        });
        serverDB.close();
    });

    app.get('/checkUpdate', isLoggedIn, function(req, res) {
        var query = req._parsedUrl.query;
        console.log('GET /checkUpdate');
        console.log('Query: ' + query);

        var parts = query.split('=');
        var userID = parseInt(parts[1]);

        var notificationList = [];
        serverDB = new sqlite3.Database(serverDBPath);
        serverDB.all('select N.NotificationID, N.DeviceID, N.NotificationType, N.Description from Notification as N, AuthorizedUser as A\
        where N.DeviceID = A.DeviceID and A.UserID = ?', userID, function(err, rows) {
            serverDB.close();
            if (!err) {
                rows.forEach(function(row) {
                    notificationList.push({
                        NotificationID: row.NotificationID,
                        DeviceID: row.DeviceID,
                        NotificationType: row.NotificationType,
                        Description: row.description
                    });
                });
            }
            res.json({
                NotificationList: notificationList
            })
        });
    });

    app.get('/authorizedUser', isLoggedIn, function(req, res) {
        var query = req._parsedUrl.query;
        var parts = query.split('&');
        var tmpParts;
        
        var deviceID;
        var userID;

        tmpParts = parts[0].split('=');
        deviceID = parseInt(tmpParts[1]);
        tmpParts = parts[1].split('=');
        userID = parseInt(tmpParts[1]);

        serverDB = new sqlite3.Database(serverDBPath);
        userList = [];
        serverDB.all('select U.UserID, U.UserName from User as U, AuthorizedUser as A\
            where U.UserID = A.UserID and A.DeviceID = ?',
            deviceID, function(err, rows) {
                console.log('/authorizedUser rows from join: ' + rows);
                if (!err) {
                    rows.forEach(function(row) {
                        if (row.UserID != userID) {
                            userList.push({
                                UserID: row.UserID,
                                UserName: row.UserName
                            });
                        }
                    });
                } else {
                    console.log('ERROR in select in /authorizedUser: ' + err);
                }
                console.log('Return value');
                console.log('\tDeviceID: ' + deviceID);
                console.log('\tUserID: ' + userID);
                console.log('\tUsers: ' + userList);
                res.render('auth-device.ejs', {
                    DeviceID: deviceID,
                    UserID: userID,
                    Users: userList
                });
            }
        );
        serverDB.close();
    });

    app.get('/revokeAuthUser', isLoggedIn, function(req, res) {
        var deviceID;
        var userID;
        var tmpParts;

        var query = req._parsedUrl.query;
        var parts = query.split('&');

        tmpParts = parts[0].split('=');
        deviceID = parseInt(tmpParts[1]);
        tmpParts = parts[1].split('=');
        userID = parseInt(tmpParts[1]);

        serverDB = new sqlite3.Database(serverDBPath);
        serverDB.get('delete from AuthorizedUser where DeviceID = ? and UserID = ?', deviceID, userID, function(err){
            if (!err) {

            } else {
                console.log('ERROR in /revokeAuthUser: ' + err);
            }
        })
        serverDB.close();     
    });

    app.get('/addAuthUser', isLoggedIn, function(req, res) {
        var deviceID;
        var userName;
        var userID;
        var permission;
        var tmpParts;
        var status = 2;
        var query = req._parsedUrl.query;
        var parts = query.split('&');

        tmpParts = parts[0].split('=');
        deviceID = parseInt(tmpParts[1]);
        tmpParts = parts[1].split('=');
        userName = tmpParts[1];
        tmpParts = parts[2].split('=');
        permission = parseInt(tmpParts[1]);

        serverDB = new sqlite3.Database(serverDBPath);
        serverDB.get('select * from User where UserName = ?', userName, function(err, row) {
            if (!err) {
                if (row != undefined) {
                    serverDB.get('select UserID from User where UserName = ?', userName, function(err, userRow) {
                        if (!err && userRow != undefined) {
                            userID = userRow.UserID;
                            serverDB.get('delete from AuthorizedUser where DeviceID = ? and UserID = ?', deviceID, userID, function(err){
                                serverDB.get('insert into AuthorizedUser (DeviceID, UserID, Permission) values (?, ?, ?)',
                                    deviceID, userID, permission, function(err) {
                                        if (!err) {
                                            status = 0;
                                        } else {
                                            console.log('ERROR in insert in /addAuthUser: ' + err);
                                        }
                                        res.send({Status: status, UserID: userID});
                                    })
                            });
                        } else {
                            res.send({Status: status, UserID: userID});
                            console.log('ERROR in delete in /addAuthUser: ' + err);
                        }
                    });
                } else {
                    status = 1;
                    res.send({Status: status, UserID: userID});
                }
            }
        });
        serverDB.close();
    });

    // =====================================
    // LOGOUT ==============================
    // =====================================
    app.get('/logout', function(req, res) {
        console.log('GET /logout');

        req.logout();
        res.redirect('/');
    });

    app.get('/addDevice',isLoggedIn, function(req, res) {
        console.log('GET /addDevice');

        res.render('qr_scanner.ejs');
        //res.render('deviceAdd.ejs',{url : configDB.url});
    });

    // process the signup form
    app.post('/signup', passport.authenticate('local-signup', {
        successRedirect : '/profile', // redirect to the secure profile section
        failureRedirect : '/signup', // redirect back to the signup page if there is an error
        failureFlash : true // allow flash messages
    }));

    // process the login form
    app.post('/login', passport.authenticate('local-login', {
        failureRedirect : '/login', // redirect back to the signup page if there is an error
        failureFlash : true // allow flash messages   
    }),function (req, res) { 
        if(req.session.returnTo){       
          res.redirect(req.session.returnTo || '/');  delete req.session.returnTo; 
      }else{
          res.redirect('/profile');
      }  
  });

    // process QR-code
    app.get('/QRcode/',isLoggedIn, function (req, res) {
        console.log('GET /QRcode');

        var peer_id = req.query.PeerId;

        var noob = req.query.Noob;
        var hoob = req.query.Hoob;
        var queryObject = url.parse(req.url,true).query;
        var len = Object.keys(queryObject).length;

        if(len != 3 || peer_id == undefined || noob == undefined || hoob == undefined)
        {
            console.log('CASE I');
            req.flash('profileMessage','Wrong query String! Please try again with proper Query!!' );
            res.redirect('/profile');
        }else if(noob.length != 22 || hoob.length != 22){
            console.log('CASE II');

            console.log("Updating Error!!!" + peer_id);
            db = new sqlite3.Database(conn_str);

        db.serialize(function() {
            var stmt = db.prepare("UPDATE peers_connected SET OOB_RECEIVED_FLAG = ?, Noob = ?, Hoob = ?, errorCode = ?, userName = ?, serv_state = ? WHERE PeerID = ?");
            stmt.run(1234,"","",3,req.user.username,2,peer_id);
            stmt.finalize();
        });

            db.close();
            req.flash('profileMessage','Invalid Data');
            res.redirect('/profile');

        }else{
            console.log('CASE III, correct');
            // correct information
            db = new sqlite3.Database(conn_str);
            db.serialize(function() {
                var stmt = db.prepare("UPDATE peers_connected SET OOB_RECEIVED_FLAG = ?, Noob = ?, Hoob = ?, userName = ?, serv_state = ? WHERE PeerID = ?");
                stmt.run(1234,noob,hoob,req.user.username,2,peer_id);
                stmt.finalize();
            });
            db.close();
            req.flash('profileMessage','Received Successfully');
            res.redirect('/profile');

            console.log('prepare to add uninitialized device into database')
            serverDB = new sqlite3.Database(serverDBPath);

            var userName = req.user.username;
            var userID;
            serverDB.get('select UserID from User where UserName = ?', userName, function(err, userRow){
                if (!err && userRow != undefined) {
                    userID = userRow.UserID;

                    serverDB.run(
                        'insert into Device (DeviceID, ConnectionID, DeviceName, Description) \
                        values(?, ?, ?, ?)',
                        GlobalDeviceID, peer_id, 'Connecting...', '',
                        function(err, row) {
                            if (err) {
                                console.log('ERROR: ' + err);
                            }
                            serverDB.run(
                                'insert into AuthorizedUser (DeviceID, UserID, Permission) \
                                values(?, ?, ?)',
                                GlobalDeviceID, userID, 0, function(err, row){
                                    GlobalDeviceID += 1;
                                }
                            );
                        }
                    );
                }
            })
            serverDB.close();
        }
    });

    app.get('/stateUpdate', function(req, res) {
        console.log('GET /stateUpdate');

        var peer_id = req.query.PeerId;
        var state = req.query.State;
        var queryObject = url.parse(req.url,true).query;
        var len = Object.keys(queryObject).length;

        if(len != 2 || peer_id == undefined || state == undefined)
        {
         console.log("Its wrong Query");
         res.json({"error":"Wrong Query."});
         }else{
             console.log('req received');
             db = new sqlite3.Database(conn_str);
             db.get('SELECT serv_state,errorCode FROM peers_connected WHERE PeerID = ?', peer_id, function(err, row) {
                db.close();
                if (!row){res.json({"state": "No record found.","state_num":"0"});}
                else if(row.errorCode) { res.json({"state":error_info[parseInt(row.errorCode)], "state_num":"0"}); console.log(row.errorCode) }
                else if(parseInt(row.serv_state) == parseInt(state)) {res.json({"state":""});}
                else {res.json({"state": state_array[parseInt(row.serv_state)], "state_num": row.serv_state});}
            });
        }
    });

    app.get('/deleteDevice', function(req, res) {
        console.log('GET /deleteDevice');

        var peer_id = req.query.PeerId;
        var queryObject = url.parse(req.url,true).query;
        var len = Object.keys(queryObject).length;

        if(len != 1 || peer_id == undefined)
        {
         res.json({"status":"failed"});
     }else{
         console.log('req received');

         db = new sqlite3.Database(conn_str);
         db.get('SELECT count(*) AS rowCount FROM peers_connected WHERE PeerID = ?', peer_id, function(err, row) {


            if (err){res.json({"status": "failed"});}
            else if(row.rowCount != 1) {res.json({"status": "refresh"});}
            else {
                db.get('DELETE FROM peers_connected WHERE PeerID = ?', peer_id, function(err, row) {
                    db.close();
                    if (err){res.json({"status": "failed"});}
                    else {res.json({"status": "success"});}
                });
            }
        });

     }
 }
 );
};


// route middleware to make sure a user is logged in
function isLoggedIn(req, res, next) {

    // if user is authenticated in the session, carry on 
    if (req.isAuthenticated())
        return next();

    var str = req.path;

    var peer_id = req.query.PeerId;

    var noob = req.query.Noob;

    var hoob = req.query.Hoob;

    if(peer_id != undefined)  str = str + '?PeerId=' + peer_id;
    if(noob != undefined)  str = str + '&Noob=' + noob;
    if(hoob != undefined)  str = str + '&Hoob=' + hoob;
    req.session.returnTo = str;
    res.redirect('/login');
}
