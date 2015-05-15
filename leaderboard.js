// Meteor Leaderboard Example with PostgreSQL backend

// Data is read from select statements published by server (further down)
players = new PgSubscription('allPlayers');



if (Meteor.isClient) {

  /*
  // Provide a client side stub for latency compensation
  //This code is optionnal : if added, then scores will be updated sooner on the browser
  //that does the action.
  Meteor.methods({
    'incScore': function(id, amount){
      var originalIndex;
      players.forEach(function(player, index){
        if(player.id === id){
          originalIndex = index;
          players[index].score += amount;
          players.changed();
        }
      });

      // Reverse changes if needed (due to resorting) on update
      players.addEventListener('update.incScoreStub', function(index, msg){
        if(originalIndex !== index){
          players[originalIndex].score -= amount;
        }
        players.removeEventListener('update.incScoreStub');
      });
    }
  });
  */

  Template.leaderboard.helpers({
    players: function () {
      return players.reactive();
    },
    selectedName: function () {
      players.depend();
      var player = players.filter(function(player){
        return player.id === Session.get("selectedPlayer");
      });
      return player.length && player[0].name;
    }
  });

  Template.leaderboard.events({
    'click .inc': function () {
      Meteor.call('incScore', Session.get("selectedPlayer"), 5);
    }
  });

  Template.player.helpers({
    selected: function () {
      return Session.equals("selectedPlayer", this.id) ? "selected" : '';
    }
  });

  Template.player.events({
    'click': function () {
      Session.set("selectedPlayer", this.id);
    }
  });
}

if (Meteor.isServer) {
  // XXX: Update this connection string to match your configuration!
  var CONN_STR = 'postgres://meteor:roetem@127.0.0.1/leaderboard'

  var triggerSuffix = 'pgtriggersuffix_leaderboard_example'; //// a trigger with this suffix will be added to the postgres table !
  var liveDb = new LivePg(CONN_STR, triggerSuffix);

  var closeAndExit = function() {
    // Cleanup removes triggers and functions used to transmit updates
    liveDb.cleanup(process.exit);
  };
  // Close connections on hot code push
  process.on('SIGTERM', closeAndExit);
  // Close connections on exit (ctrl + c)
  process.on('SIGINT', closeAndExit);

  Meteor.publish('allPlayers', function(){
    return liveDb.select('SELECT * FROM players ORDER BY score DESC',
      {
        //Optional trigger specialization
        //Here, we tell it that we are not interested in receiving updates when the score is >= 100
        //(this is totally dumb, but serves as an example)
        'players' : function(row) {
          return row.score < 100;
        }
      }
    );
  });



  Meteor.methods({
    'incScore': function(id, amount){
      // Ensure arguments validate
      check(id, Number);
      check(amount, Number);
      Meteor._sleepForMs(2000); // Simulate lag on the server side

      // Obtain a client from the pool
      pg.connect(CONN_STR, function(error, client, done) {
        if(error) throw error;

        // Perform query
        client.query(
          'UPDATE players SET score = score + $1 WHERE id = $2',
          [ amount, id ],
          function(error, result) {
            // Release client back into pool
            done();

            if(error) throw error;
          }
        )
      });
    }
  });
}
