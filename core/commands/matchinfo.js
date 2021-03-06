function send_message(message, client, helper, match_data, origin) {
    let queries = [];

    match_data.players.forEach(player => {
        queries.push(client.core.util.check_if_registered(client, player.account_id));
    });

    Promise.all(queries).then(results => {
        for (let player in match_data.players) {
            if (results[player] && match_data.players[player].account_id == results[player].dota_id && message.channel.guild.members.find(member => member.id == results[player].discord_id)) {
                match_data.players[player]["mention_str"] = `<@${results[player].discord_id}>`;
            }
        }

        message.channel.createMessage({
            "embed": client.core.embeds.match(client.core.json.od_heroes, match_data),
            "content": message.header || ""
        }).then(() => {
            helper.log(message, `  sent match data from ${origin}`);
        }).catch(err => {
            helper.handle(message, err);
        });
    }).catch(err => {
        helper.log(message, "  something went wrong selecting from the database");
        helper.log(message, err);
    });
}

function fix_scores(match_data, mika) {
    match_data.radiant_score = match_data.players.slice(0, 5).map(player => player.kills).reduce((a, b) => a + b, 0);
    match_data.dire_score = match_data.players.slice(5, 10).map(player => player.kills).reduce((a, b) => a + b, 0);

    if (mika) mika.postByMatchId(match_data.match_id);
}

async function matchinfo(message, client, helper) {
    let locale = client.core.locale[message.gcfg.locale];

    let match_id = message.content.split(" ")[1];
    if (!match_id) return;

    if (match_id.match("dotabuff") || match_id.match("opendota")) {
        let url = match_id.split("/");
        match_id = url[url.length - 1];
    }

    if (isNaN(match_id)) {
        message.channel.createMessage(locale.com.matchinfo.error).catch(err => helper.handle(message, err));
        return;
    }

    helper.log(message, `matchinfo: ${match_id}`);

    try {
        await message.channel.sendTyping();
    } catch (err) {
        helper.handle(message, err);
    }

    client.redis.get(`matchinfo:${match_id}`, (err, reply) => {
        if (err) helper.log(message, err);
        if (reply) {
            reply = JSON.parse(reply);
            if (!reply.radiant_score && !reply.dire_score) fix_scores(reply);
            send_message(message, client, helper, reply, "redis");
        } else {
            client.mika.getMatch(match_id).then(match_data => {
                if (!match_data.radiant_score && !match_data.dire_score) fix_scores(match_data, client.mika);
                send_message(message, client, helper, match_data, "api");
                client.redis.set(`matchinfo:${match_id}`, JSON.stringify(match_data), (err) => {
                    if (err) helper.log(message, err);
                    client.redis.expire(`matchinfo:${match_id}`, 604800);
                });
            }).catch(err => {
                message.channel.createMessage(locale.generic.generic).catch(err => helper.handle(message, err));
                helper.log(message, "  something went wrong with mika");
                helper.log(message, err);
            });
        }
    });
}

module.exports = matchinfo;
