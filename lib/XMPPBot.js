var path = require('path');
var os = require('os');
var Botkit = require(__dirname + '/CoreBot.js');
const XMPPClient = require('node-xmpp-client'), ltx = XMPPClient.ltx

const XMPPBot = function(configuration) {

    var xmppBot = Botkit(configuration || {});

    if (!configuration || !configuration.account) {
        throw Error('Configuration account object missing e.g. {account : {jid: "user@server", host: "server", port: 5222}} missing');
    }

    if (!configuration.account.jid) {
        throw Error("Specify an 'jid' in your configuration.account object");
    }

    if (!configuration.account.password) {
        throw Error("Specify an 'password' in your configuration.account object");
    }

    if (!configuration.account.host) {
        throw Error("Specify an 'host' in your configuration.account object");
    }
    
    if (!configuration.account.port) {
        configuration.account.port = 5222;
        xmppBot.debug("No XMPP port was found in configuration.account.port so default of 5222 used");
    }

    xmppBot.middleware.spawn.use(function (bot, next) {

        xmppBot.startTicking();
        xmppBot.init(bot);
        next();

    });

    xmppBot.middleware.format.use(function (bot, message, platform_message, next) {

        for (var k in message) {
            platform_message[k] = message[k];
        }

        next();
    });
    
    const xmppClient = new XMPPClient(configuration.account);

    xmppBot.init = function (bot) {

        xmppClient.once('online', (connectionDetails) => {
            xmppBot.debug('We are connected to XMPP server!');
            sendPresence();
        })

        xmppClient.on('stanza', (stanza) => {
            if (true === stanza.is('message')) {
                return handleMessage(stanza)
            } else if (true === stanza.is('presence')) {
                return handlePresence(stanza)
            }
        });

        let lastFrom = null;
        const handleMessage = (stanza) => {
            xmppBot.debug('Incoming stanza: ' + stanza.toString())
            if (false === stanza.is('message'))
                return
            const messageContent = stanza.getChildText('body')
            if (!messageContent)
                return
            const from = stanza.attr('from')
            lastFrom = from;
            const logEntry = 'Received message from ' + from + ' with content: ' + messageContent;

            var message = {
                text: messageContent,
                user: from,
                channel: 'xmpp',
                timestamp: Date.now()
            };

            xmppBot.ingest(bot, message, null);
        }

        const handlePresence = (stanza) => {
            if (false === stanza.attr('subscribe')) {
                return
            }
            const reply = new ltx.Element(
                    'presence',
                    {type: 'subscribed', to: stanza.attr('from')}
            )
            xmppClient.send(reply)
        }
        
        const sendPresence = () => {
            var stanza = new ltx.Element('presence')
            xmppBot.debug('Sending presence: ' + stanza.toString())
            xmppClient.send(stanza)
        }

        xmppClient.sendMessage = (message) => {
            const stanza = new ltx.Element(
                    'message',
                    {type: 'chat', to: message.to || lastFrom}
            )

            stanza.c('body').t(message.text)
            xmppBot.debug('Sending XMPP Stanza: ' + stanza.toString())

            xmppClient.send(stanza)
        }

    }

    xmppBot.defineBot(function (botkit, config) {

        var bot = {
            botkit: botkit,
            config: config || {},
            utterances: botkit.utterances,
            xmppClient : xmppClient
        };

        bot.createConversation = function (message, cb) {
            botkit.createConversation(this, message, cb);
        };

        bot.startConversation = function (message, cb) {
            botkit.startConversation(this, message, cb);
        };

        bot.send = function (message, cb) {
            if (typeof (message) === 'string') {
                message = {text: message};
            }

            xmppClient.sendMessage(message);
            if (cb) {
                cb();
            }
        };


        bot.reply = function (src, resp, cb) {
            var msg = {};

            if (typeof (resp) == 'string') {
                msg.text = resp;
            } else {
                msg = resp;
            }

            msg.channel = src.channel;

            bot.say(msg, cb);
        };

        bot.findConversation = function (message, cb) {
            botkit.debug('CUSTOM FIND CONVO', message.user, message.channel);
            for (var t = 0; t < botkit.tasks.length; t++) {
                for (var c = 0; c < botkit.tasks[t].convos.length; c++) {
                    if (
                            botkit.tasks[t].convos[c].isActive() &&
                            botkit.tasks[t].convos[c].source_message.user == message.user
                            ) {
                        botkit.debug('FOUND EXISTING CONVO!');
                        cb(botkit.tasks[t].convos[c]);
                        return;
                    }
                }
            }

            cb();
        };

        return bot;

    });

    return xmppBot;
}
;

module.exports = XMPPBot;
