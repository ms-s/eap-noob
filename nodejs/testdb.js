var sqlite3 = require('sqlite3').verbose();
var serverDB;

// db = new sqlite3.Database('testdb');
// serverDB = new sqlite3.Database('../../../serverDB');
serverDB = new sqlite3.Database('testdb');

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

  // serverDB.close();
});

// put all of them in serialization
// close at the end
// close when error occurs


// serverDB.get('insert into Device \
// 	(DeviceID, ConnectionID, DeviceName, DeviceState, Description, DeviceType, SoftwareUpdateURL, UserID, Image) \
// 	values(?,?,?,?,?,?,?,?,?)', 23, 'ConnectionID_adhfjka','Phone', 'Online', 'Apple iPhone', 'Video;Audio', 'file.txt', 1, 'url',
// 	function(err, row) {
// 		if (err) {
// 			console.log(err);
// 		}
// 	}
// );

serverDB.get('insert into Notification \
	(NotificationID, UserID, DeviceID, Timestamp, NotificationType, Description) \
	values(?, ?, ?, ?, ?, ?)',
	0, 1, 23, Date.now(), 'SoftwareUpdate', 'This is a description',
	function(err, row) {
		if (err) {
			console.log(err);
		}
	}
);

// serverDB.get('insert into ContentList \
// 	(ContentID, ContentName, ContentType, ContentURL, Source, UserID) \
// 	values (?, ?, ?, ?, ?, ?)',
// 	0, 'Sword Art Online Main Theme', 'Video', 'https://www.youtube.com/watch?v=D5kyjnlDNZs', 'YouTube', 1,
// 	function(err, row) {
// 		if (err) {
// 			console.log(err);
// 		}
// 	}
// );

// serverDB.serialize(function() {
// 	serverDB.run(
//         'insert into Device (ConnectionID) \
//         values(?)',
//         'asdfasdklfhasdjklhfjkashli',
//         function(err, row) {
//         	console.log(err);
//         	console.log('FINISH1');
//         }
//     );

//     serverDB.run(
//         'insert into Device (ConnectionID) \
//         values(?)',
//         'asdfasdklfhasdjklhfjkashli',
//         function(err, row) {
//         	console.log(err);
//         	console.log('FINISH2');
//         }
//     );
//     serverDB.run(
//         'insert into Device (ConnectionID) \
//         values(?)',
//         'asdfasdklfhasdjklhfjkashli',
//         function(err, row) {
//         	console.log(err);
//         	console.log('FINISH3');
//         }
//     );
//     serverDB.run(
//         'insert into Device (ConnectionID) \
//         values(?)',
//         'asdfasdklfhasdjklhfjkashli',
//         function(err, row) {
//         	console.log(err);
//         	console.log('FINISH4');
//         }
//     );
// })
serverDB.close();
