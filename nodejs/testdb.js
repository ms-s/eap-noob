var sqlite3 = require('sqlite3').verbose();
var db;

// db = new sqlite3.Database('testdb');
db = new sqlite3.Database('/var/serverDB');
db.serialize(function() {
	db.run('create table if not exists User \
		(UserID integer primary key autoincrement, \
		UserName text, \
		Password text);');

	db.run('create table if not exists Device \
		(DeviceID integer primary key autoincrement, \
		DeviceName text, \
		DeviceState text, \
		Description text, \
		UserID integer, \
		Image text);');

	db.run('create table if not exists Notification \
		(NotificationID integer primary key autoincrement, \
		UserID integer, \
		DeviceID integer, \
		Timestamp integer, \
		NotificationType text, \
		Description text);');

	db.run('create table if not exists ContentList \
		(ContentID integer primary key autoincrement, \
		ContentName text, \
		ContentType text, \
		ContentURL text, \
		Source text, \
		UserID integer\
		);');
});

// put all of them in serialization
// close at the end
// close when error occurs


db.get('insert into Device \
	(DeviceID, DeviceName, DeviceState, Description, DeviceType, SoftwareUpdateURL, UserID, Image) \
	values(?,?,?,?,?,?,?,?)', 23, 'Phone', 'Online', 'Apple iPhone', 'Video;Audio', 'file.txt', 1, 'url',
	function(err, row) {
        
		if (err) {
			console.log(err);
		// 	res.json({"status": "failed"});
		}
		// else {
		// 	res.json({"status": "success"});
		// }
	}
);

// db.get('insert into User \
// 	(UserID, UserName, Password) \
// 	values(?, ?, ?)',
// 	1481, 'Jane', '123',
// 	function(err, row) {
// 		if (err) {
// 			console.log(err);
// 		}
// 	}
// );

// Date.new() returns UNIX timestamp in milliseconds
db.get('insert into Notification \
	(NotificationID, UserID, DeviceID, Timestamp, NotificationType, Description) \
	values(?, ?, ?, ?, ?, ?)',
	0, 1, 23, Date.now(), 'SoftwareUpdate', 'This is a description',
	function(err, row) {
		if (err) {
			console.log(err);
		}
	}
);

db.get('insert into ContentList \
	(ContentID, ContentName, ContentType, ContentURL, Source, UserID) \
	values (?, ?, ?, ?, ?, ?)',
	0, 'Sword Art Online Main Theme', 'Video', 'https://www.youtube.com/watch?v=D5kyjnlDNZs', 'YouTube', 1,
	function(err, row) {
		if (err) {
			console.log(err);
		}
	}
);

db.close();
