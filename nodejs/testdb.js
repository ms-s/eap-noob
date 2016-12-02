var sqlite3 = require('sqlite3').verbose();
var serverDB;

// db = new sqlite3.Database('testdb');
// serverDB = new sqlite3.Database('../../../serverDB');
serverDB = new sqlite3.Database('testdb');

serverDB.serialize(function() {
  serverDB.run('create table if not exists Device \
    (DeviceID integer primary key autoincrement, \
    UserID integer, \
    Value integer);');
});


// serverDB.run('insert into Device \
// 	(UserID, Value) \
// 	values(?, ?)',
// 	233, 1481,
// 	function(err, row) {
// 		if (!err) {
//             console.log(row);
//         } else {
//             console.log('ERROR: ' + err);
//         }
// 	}
// );

serverDB.get('select * from Device where UserID = ?', 2213, function(err, row) {
    if (!err) {
        console.log(row);
    }
});

serverDB.close();