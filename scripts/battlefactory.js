/*
Battle Factory Program Script for Pokemon Online

Coding done by Shadowfist

Requires bfteams.json to work.

Files: bfteams.json
Folders created: submissions, (messagebox may be used in the future, but not now)
*/

// Globals
var bfversion = "1.100a";
var dataDir = "bfdata/";
var submitDir = dataDir+"submit/";
var messDir = dataDir+"messages/";
var bfsets, pokedb, working, defaultsets, userqueue, messagebox, teamrevchan, submitbans, bfhash, reviewers;
var randomgenders = true; // set to false if you want to play with set genders
var utilities = require('utilities.js');
var saveInterval = 3600; // autosave every 1 hour

// Will escape "&", ">", and "<" symbols for HTML output.
var html_escape = utilities.html_escape;

function initFactory() {
    sys.makeDir("bfdata");
    sys.makeDir("bfdata/submit");
    try {
        var file = sys.getFileContent(dataDir+"bfteams.json");
        if (file === undefined) {
            var url = Config.base_url+dataDir+"bfteams.json";
            normalbot.sendAll("Teams file not found, fetching teams from "+url, staffchannel);
            sys.webCall(url, function(resp) {
                if (resp !== "") {
                    try {
                        var test = JSON.parse(resp);
                        var res = setlint(test, false);
                        if (res.errors.length >= 1) {
                            throw "Bad File";
                        }
                        sys.writeToFile(dataDir+'bfteams.json', resp);
                        defaultsets = test;
                        sendChanAll('Updated Battle Factory Teams!', staffchannel);
                    }
                    catch (err) {
                        sendChanAll("FATAL ERROR: "+err, staffchannel);
                        throw "Battle Factory web file is corrupt!";
                    }
                }
                else {
                    sendChanAll("Failed to load teams!", staffchannel);
                    throw "Couldn't load the Battle Factory file!";
                }
            });
        }
        else {
            defaultsets = JSON.parse(file);
        }
        getPokeDb();
    }
    catch (e) {
        throw e;
    }
    try {
        userqueue = JSON.parse(sys.getFileContent(submitDir+"index.json"));
    }
    catch (e) {
        sendChanAll("No Battle Factory queue detected!", staffchannel);
        userqueue = [];
    }
    try {
        submitbans = JSON.parse(sys.getFileContent(submitDir+"bans.json"));
    }
    catch (e) {
        submitbans = {};
    }
    try {
        reviewers = JSON.parse(sys.getFileContent(submitDir+"reviewers.json"));
    }
    catch (e) {
        reviewers = {
            'Wifi Ubers': [],
            'Wifi OU': [],
            'Random Battle': [],
            'Wifi UU': [],
            'Wifi LU': [],
            'Wifi NU': [],
            'Wifi LC': [],
            'Middle Cup': []
        };
        sys.writeToFile(submitDir+"reviewers.json", JSON.stringify(reviewers));
    }
    try {
        bfhash = JSON.parse(sys.getFileContent(dataDir+"bfhash.json"));
    }
    catch (e) {
        sendChanAll("Making default bfhash", staffchannel);
        // name, filepath, whether it is being actively used (human choice), whether it is enabled (automated)
        bfhash = {
            'preset': {'path': 'bfteams.json', 'active': true, 'enabled': false, 'url': Config.base_url+dataDir+"bfteams.json"},
            'Wifi Ubers': {'path': 'bfteams_wifiubers.json', 'active': true, 'enabled': false},
            'Wifi OU': {'path': 'bfteams_wifiou.json', 'active': true, 'enabled': false},
            'Random Battle': {'path': 'bfteams_randombattle.json', 'active': true, 'enabled': false},
            'Wifi UU': {'path': 'bfteams_wifiuu.json', 'active': true, 'enabled': false},
            'Wifi LU': {'path': 'bfteams_wifilu.json', 'active': true, 'enabled': false},
            'Wifi NU': {'path': 'bfteams_wifinu.json', 'active': true, 'enabled': false},
            'Wifi LC': {'path': 'bfteams_wifilc.json', 'active': true, 'enabled': false},
            'Middle Cup': {'path': 'bfteams_middlecup.json', 'active': true, 'enabled': false}
        };
        sys.writeToFile(dataDir+"bfhash.json", JSON.stringify(bfhash));
    }
    var validsetpacks = 0;
    bfsets = {};
    for (var x in bfhash) {
        var teampack = sys.getFileContent(dataDir + bfhash[x].path);
        if (teampack === undefined) {
            createDefaultEntry(bfhash[x].path, x);
            bfsets[x] = {};
            continue;
        }
        else {
            try {
                var teamfile = JSON.parse(teampack);
                var res = setlint(teamfile, false);
                if (res.errors.length >= 1) {
                    throw "Bad File";
                }
                bfsets[x] = teamfile;
                if (numPokes(teamfile) < 12) {
                    throw "Not enough Pokemon";
                }
                bfhash[x].enabled = true;
                validsetpacks += 1;
            }
            catch (e) {
                sendChanAll("Set pack "+x+" is invalid: "+e, staffchannel);
                bfhash[x].enabled = false;
            }
        }
    }
    if (validsetpacks === 0) {
        sendChanAll("No valid Battle Factory sets detected!", staffchannel);
        throw "No valid set packs available";
    }
    teamrevchan = utilities.get_or_create_channel("BF Review");
    sendChanAll("Version "+bfversion+" of the Battle Factory loaded successfully!", staffchannel);
    working = true;
}

function createDefaultEntry(path, desc) {
    var pathname = dataDir + path;
    if (sys.getFileContent(pathname) === undefined) {
        sys.writeToFile(pathname, JSON.stringify({'desc': desc}));
        return true;
    }
    return false;
}

function createEntry(name, data, srcurl) {
    var basepathname = "bfteams_" + (name.replace(/ /g, "")).toLowerCase() + ".json";
    if (!data.hasOwnProperty('desc')) {
        data.desc = name;
    }
    if (sys.getFileContent(dataDir + basepathname) === undefined) {
        sys.writeToFile(dataDir + basepathname, JSON.stringify(data));
        bfhash[name] = {'path': basepathname, 'active': true, 'enabled': true, 'url': srcurl};
        bfsets[name] = data;
        return true;
    }
    return false;
}

// Save user generated info periodically as a backup
function autoSave(type, params) {
    if (type == "all") {
        cleanEntries();
        sys.writeToFile(submitDir+"index.json", JSON.stringify(userqueue));
        sys.writeToFile(dataDir+"bfhash.json", JSON.stringify(bfhash));
        for (var x in bfhash) {
            if (bfsets.hasOwnProperty(x)) {
                sys.writeToFile(dataDir + bfhash[x].path, JSON.stringify(bfsets[x]));
            }
        }
    }
    if (type == "queue") {
        cleanEntries();
        sys.writeToFile(submitDir+"index.json", JSON.stringify(userqueue));
    }
    if (type == "teams") {
        sys.writeToFile(dataDir+"bfhash.json", JSON.stringify(bfhash));
        for (var b in bfhash) {
            if (bfsets.hasOwnProperty(b) && (params == "all" || params == b)) {
                sys.writeToFile(dataDir + bfhash[b].path, JSON.stringify(bfsets[b]));
            }
        }
    }
}

function getPokeDb() {
    var pokelist = sys.getFileContent("db/pokes/stats.txt");
    var pokes = pokelist.split("\n");
    pokedb = {};
    for (var x in pokes) {
        var data = pokes[x].split(" ");
        if (data.length != 7) {
            continue;
        }
        var thepokeid = data[0].split(":");
        var thepoke = sys.pokemon(parseInt(thepokeid[0],10) + 65536*parseInt(thepokeid[1],10));
        pokedb[thepoke] = [parseInt(data[1],10), parseInt(data[2],10), parseInt(data[3],10), parseInt(data[4],10), parseInt(data[5],10), parseInt(data[6],10)];
    }
    var genderlist = sys.getFileContent("db/pokes/gender.txt");
    var genders = genderlist.split("\n");
    for (var g in genders) {
        var gdata = genders[g].split(" ");
        if (gdata.length != 2) {
            continue;
        }
        var gpokeid = gdata[0].split(":");
        var gpoke = sys.pokemon(parseInt(gpokeid[0]), 10);
        pokedb[gpoke].push(parseInt(gdata[1],10));
    }
}

function dumpData(tar, team) {
    var sets = [];
    for (var b=0;b<6;b++) {
        sets.push(getStats(tar, team, b).join("<br/>"));
    }
    var chans = sys.channelsOfPlayer(tar);
    if (sets.length > 0 && chans.length > 0) {
        var sendchannel = sys.isInChannel(tar, 0) ? 0 : chans[0];
        sys.sendHtmlMessage(tar, "<table border='2'><tr><td><pre>"+sets.join("<br/><br/>")+"</pre></td></tr></table>",sendchannel);
    }
    return;
}

// Whether the data is readable or not
function isReadable(key) {
    if (!bfsets.hasOwnProperty(key)) {
        return false;
    }
    var file = bfsets[key];
    if (file.hasOwnProperty("readable")) {
        if (file.readable === true) {
            return true;
        }
    }
    return false;
}

function refresh(key) {
    try {
        if (!bfhash.hasOwnProperty(key)) {
            return;
        }
        var file = sys.getFileContent(dataDir + bfhash[key].path);
        if (file === undefined) {
            sendChanAll("Team Pack "+key+" is missing!", teamrevchan);
            throw "File not found";
        }
        bfsets[key] = JSON.parse(file);
        var message = [];
        var teamfile = bfsets[key];
        if (teamfile.hasOwnProperty('desc')) {
            if (typeof teamfile.desc == "string") {
                message.push("Successfully loaded the team pack '"+teamfile.desc+"'");
                bfhash[key].enabled = true;
            }
            else {
                message.push("Warning: Team set description was faulty");
            }
        }
        else {
            message.push("Successfully loaded the team pack: "+key);
        }

        if (numPokes(teamfile) < 12) {
            message.push("Not enough Pokemon for the pack: "+key);
            bfhash[key].enabled = false;
        }
        else {
            bfhash[key].enabled = true;
        }
        var tteams = 0;
        var tsets = 0;
        for (var a in teamfile) {
            if (typeof teamfile[a] != "object") {
                continue;
            }
            tteams += 1;
            var setlength = 0;
            if (isReadable(key)) {
                var lteams = teamfile[a];
                for (var k in lteams) {
                    setlength += 1;
                }
            }
            else {
                setlength = teamfile[a].length;
            }
            tsets += setlength;
        }
        message.push("Total: "+tteams+" pokes and "+tsets+" sets.");
        if (message.length > 0) {
            sendChanAll(message.join("; "), teamrevchan);
        }
    }
    catch (err) {
        sendChanAll("Couldn't refresh teams: "+err, teamrevchan);
    }
}

function cleanEntries() {
    var deleted = 0;
    for (var x=0; x<userqueue.length; x++) {
        var obj = userqueue[x];
        if (typeof obj != 'object' || obj === null) {
            userqueue.splice(x,1);
            x -= 1;
            deleted += 1;
            continue;
        }
        if (!obj.hasOwnProperty('ip') || !obj.hasOwnProperty('name') || !obj.hasOwnProperty('sets') || !obj.hasOwnProperty('tier')) {
            userqueue.splice(x,1);
            x -= 1;
            deleted += 1;
            continue;
        }
    }
    if (deleted > 0) sendChanAll("Invalid Entries Removed: "+deleted, staffchannel);
}

function toChars(number, maxchars) {
    var digits = ['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
    var result = '';
    for (var h=(maxchars-1); h>=0; h--) {
        result = result + digits[Math.floor(number/Math.pow(digits.length,h))%digits.length];
    }
    return result;
}

function toNumber(charstring) {
    var digits = ['0','1','2','3','4','5','6','7','8','9','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
    var result = 0;
    if (charstring.length == 3) {
        result = Math.pow(digits.length,2)*digits.indexOf(charstring.charAt(0)) + digits.length*digits.indexOf(charstring.charAt(1)) + digits.indexOf(charstring.charAt(2));
    }
    if (charstring.length == 2) {
        result = digits.length*digits.indexOf(charstring.charAt(0)) + digits.indexOf(charstring.charAt(1));
    }
    if (charstring.length == 1) {
        result = digits.indexOf(charstring.charAt(0));
    }
    return result;
}

function seeQueueItem(index) {
    if (index > userqueue.length || index < 0 || userqueue.length === 0 || userqueue[0] === undefined) {
        normalbot.sendChanAll("Nothing in the queue"+(index === 0 ? "." : " at index "+index), teamrevchan);
        return;
    }
    cleanEntries();
    var submitinfo = userqueue[0];
    var sets = [];
    normalbot.sendChanAll("Queue length is currently "+userqueue.length+". The set for review is shown below.", teamrevchan);
    sendChanAll("", teamrevchan);
    normalbot.sendChanAll("User: "+submitinfo.name, teamrevchan);
    normalbot.sendChanAll("Tier: "+submitinfo.tier, teamrevchan);
    var pokesets = submitinfo.sets;
    for (var b in pokesets) {
        sets.push(getReadablePoke(pokesets[b]).join("<br/>"));
    }
    sendChanHtmlAll("<table border='2'><tr><td><pre>"+sets.join("<br/><br/>")+"</pre></td></tr></table>", teamrevchan);
    sendChanAll("", teamrevchan);
    normalbot.sendChanAll("Use /acceptset to accept this submission, /rejectset to reject it, or /nextset to view the next and come back to this later.", teamrevchan);
}

function sendQueueItem(src, index) {
    if (index > userqueue.length || index < 0 || userqueue.length === 0 || userqueue[0] === undefined) {
        normalbot.sendMessage(src, "Nothing in the queue"+(index === 0 ? "." : " at index "+index), teamrevchan);
        return;
    }
    var submitinfo = userqueue[0];
    var sets = [];
    normalbot.sendMessage(src, "Queue length is currently "+userqueue.length+". The set for review is shown below.", teamrevchan);
    sys.sendMessage(src, "", teamrevchan);
    normalbot.sendMessage(src, "User: "+submitinfo.name, teamrevchan);
    normalbot.sendMessage(src, "Tier: "+submitinfo.tier, teamrevchan);
    var pokesets = submitinfo.sets;
    for (var b in pokesets) {
        sets.push(getReadablePoke(pokesets[b]).join("<br/>"));
    }
    sys.sendHtmlMessage(src, "<table border='2'><tr><td><pre>"+sets.join("<br/><br/>")+"</pre></td></tr></table>", teamrevchan);
    sys.sendMessage(src, "", teamrevchan);
    normalbot.sendMessage(src, "Use /acceptset to accept this submission, /rejectset to reject it, or /nextset to view the next and come back to this later.", teamrevchan);
}

function factoryCommand(src, command, commandData, channel) {
    // default
    if (command == "updateteams") {
        var url = Config.base_url+dataDir+"bfteams.json";
        // if (commandData.indexOf("http://") === 0 || commandData.indexOf("https://") === 0) {
        //    url = commandData;
        // }
        normalbot.sendChanMessage(src, "Fetching teams from "+url);
        sys.webCall(url, function(resp) {
            if (resp !== "") {
                try {
                    var test = JSON.parse(resp);
                    var res = setlint(test, false);
                    if (res.errors.length > 0) {
                        sendChanHtmlMessage(src, "<table border='2' cellpadding='3'><tr><th><font color=red>ERRORS</font></th><th>"+res.errors.length+"</th></tr><tr>"+res.errors.join("</tr><tr>")+"</tr></table>");
                        throw "Bad File";
                    }
                    if (res.warnings.length > 0) {
                        sendChanHtmlMessage(src, "<table border='2' cellpadding='3'><tr><th><font color=orange>WARNINGS</font></th><th>"+res.warnings.length+"</th></tr><tr>"+res.warnings.join("</tr><tr>")+"</tr></table>");
                    }
                    if (res.suggestions.length > 0) {
                        sendChanHtmlMessage(src, "<table border='2' cellpadding='3'><tr><th><font color=green>Suggestions</font></th><th>"+res.suggestions.length+"</th></tr><tr>"+res.suggestions.join("</tr><tr>")+"</tr></table>");
                    }
                    sys.writeToFile(dataDir+'bfteams.json', resp);
                    autoSave("teams", "preset");
                    sendChanAll('Updated Battle Factory Teams!', staffchannel);
                    refresh('preset');
                }
                catch (err) {
                    normalbot.sendChanMessage(src, "FATAL ERROR: "+err);
                }
            }
            else {
                normalbot.sendChanMessage(src, "Failed to update!");
            }
        });
        return;
    }
    else if (command == "addpack") {
        var url;
        var tmp = commandData.split(" ~ ",2);
        if (tmp.length != 2) {
            normalbot.sendChanMessage(src, "Usage: /addteampack [name] ~ [url]");
            return;
        }
        if (tmp[0] === "") {
            normalbot.sendChanMessage(src, "Please specify a valid name!");
            return;
        }
        if (tmp[1].indexOf("http://") === 0 || tmp[1].indexOf("https://") === 0) {
            url = tmp[1];
        }
        else {
            normalbot.sendChanMessage(src, "Please specify a valid URL to update from");
            return;
        }
        normalbot.sendChanMessage(src, "Fetching teams from "+url);
        sys.webCall(url, function(resp) {
            if (resp !== "") {
                try {
                    var test = JSON.parse(resp);
                    var res = setlint(test, false);
                    if (res.errors.length > 0) {
                        sendChanHtmlMessage(src, "<table border='2' cellpadding='3'><tr><th><font color=red>ERRORS</font></th><th>"+res.errors.length+"</th></tr><tr>"+res.errors.join("</tr><tr>")+"</tr></table>");
                        throw "Bad File";
                    }
                    if (res.warnings.length > 0) {
                        sendChanHtmlMessage(src, "<table border='2' cellpadding='3'><tr><th><font color=orange>WARNINGS</font></th><th>"+res.warnings.length+"</th></tr><tr>"+res.warnings.join("</tr><tr>")+"</tr></table>");
                    }
                    if (res.suggestions.length > 0) {
                        sendChanHtmlMessage(src, "<table border='2' cellpadding='3'><tr><th><font color=green>Suggestions</font></th><th>"+res.suggestions.length+"</th></tr><tr>"+res.suggestions.join("</tr><tr>")+"</tr></table>");
                    }
                    if (createEntry(tmp[0],test,url)) {
                        autoSave("teams", tmp[0]);
                        sendChanAll('Added the team pack '+tmp[0]+'!', staffchannel);
                        refresh(tmp[0]);
                    }
                    else {
                        sendChanAll('A pack with that name already exists!', staffchannel);
                    }
                }
                catch (err) {
                    normalbot.sendChanMessage(src, "FATAL ERROR: "+err);
                }
            }
            else {
                normalbot.sendChanMessage(src, "Failed to add the team pack!");
            }
        });
        return;
    }
    else if (command == "updatepack") {
        var url;
        var tmp = commandData.split(" ~ ",2);
        if (tmp[0] === "" || !bfhash.hasOwnProperty(tmp[0])) {
            normalbot.sendChanMessage(src, "Please specify a valid pack to update!");
            return;
        }
        if (tmp.length == 2) {
            if (tmp[1].indexOf("http://") === 0 || tmp[1].indexOf("https://") === 0) {
                url = tmp[1];
            }
            else {
                normalbot.sendChanMessage(src, "Invalid URL!");
                return;
            }
        }
        else if (bfhash[tmp[0]].hasOwnProperty('url')) {
            url = bfhash[tmp[0]].url;
        }
        else {
            normalbot.sendChanMessage(src, "Please specify a valid URL to update from!");
            return;
        }
        normalbot.sendChanMessage(src, "Updating "+tmp[0]+" teams from "+url);
        var hash = bfhash[tmp[0]];
        sys.webCall(url, function(resp) {
            if (resp !== "") {
                try {
                    var test = JSON.parse(resp);
                    var res = setlint(test, false);
                    if (res.errors.length > 0) {
                        sendChanHtmlMessage(src, "<table border='2' cellpadding='3'><tr><th><font color=red>ERRORS</font></th><th>"+res.errors.length+"</th></tr><tr>"+res.errors.join("</tr><tr>")+"</tr></table>");
                        throw "Bad File";
                    }
                    if (res.warnings.length > 0) {
                        sendChanHtmlMessage(src, "<table border='2' cellpadding='3'><tr><th><font color=orange>WARNINGS</font></th><th>"+res.warnings.length+"</th></tr><tr>"+res.warnings.join("</tr><tr>")+"</tr></table>");
                    }
                    if (res.suggestions.length > 0) {
                        sendChanHtmlMessage(src, "<table border='2' cellpadding='3'><tr><th><font color=green>Suggestions</font></th><th>"+res.suggestions.length+"</th></tr><tr>"+res.suggestions.join("</tr><tr>")+"</tr></table>");
                    }
                    bfhash[tmp[0]].url = url;
                    sys.writeToFile(dataDir+hash.path, resp);
                    autoSave("teams", tmp[0]);
                    sendChanAll('Updated '+tmp[0]+' Battle Factory Teams!', staffchannel);
                    refresh(tmp[0]);
                }
                catch (err) {
                    normalbot.sendChanMessage(src, "FATAL ERROR: "+err);
                }
            }
            else {
                normalbot.sendChanMessage(src, "Failed to update!");
            }
        });
        return;
    }
    else if (command == "deletepack") {
        if (commandData === "") {
            normalbot.sendChanMessage(src, "Please specify a team pack to remove!");
            return;
        }
        if (commandData === "preset") {
            normalbot.sendChanMessage(src, "Can't remove the built in pack!");
            return;
        }
        var delkey = commandData;
        if (bfhash.hasOwnProperty(delkey)) {
            sys.deleteFile(dataDir + bfhash[delkey].path)
            delete bfhash[delkey];
            delete bfsets[delkey];
            normalbot.sendChanMessage(src, "Removed the team pack "+delkey+"!");
            autoSave("teams", "");
        }
        else {
            normalbot.sendChanMessage(src, "Couldn't find a team pack with the name "+delkey+"!");
        }
        return;
    }
    else if (command == "disablepack") {
        if (!bfhash.hasOwnProperty(commandData)) {
            normalbot.sendChanMessage(src, "Please specify a valid team pack to disable!");
            return;
        }
        if (bfhash[commandData].active === false) {
            normalbot.sendChanMessage(src, "This pack is already disabled!");
            return;
        }
        bfhash[commandData].active = false;
        normalbot.sendChanMessage(src, "Disabled the pack: "+commandData);
        autoSave("teams", "");
        return;
    }
    else if (command == "enablepack") {
        if (!bfhash.hasOwnProperty(commandData)) {
            normalbot.sendChanMessage(src, "Please specify a valid team pack to enable!");
            return;
        }
        if (bfhash[commandData].active === true) {
            normalbot.sendChanMessage(src, "This pack is already enabled!");
            return;
        }
        bfhash[commandData].active = true;
        normalbot.sendChanMessage(src, "Enabled the pack: "+commandData);
        autoSave("teams", "");
        return;
    }
    else if (command == "pokeslist") {
        var tfile = bfsets.hasOwnProperty(commandData) ? bfsets[commandData] : bfsets.preset;
        var tteams = 0;
        var tsets = 0;
        for (var t in tfile) {
            if (typeof tfile[t] != "object") {
                continue;
            }
            var poke = sys.pokemon(parseInt(t, 10));
            tteams += 1;
            var setlength = 0;
            if (isReadable()) {
                var lteams = tfile[t];
                for (var k in lteams) {
                    setlength += 1;
                }
            }
            else {
                setlength = tfile[t].length;
            }
            tsets += setlength;
            normalbot.sendChanMessage(src, poke+": Has "+setlength+" sets.");
        }
        normalbot.sendChanMessage(src, "");
        normalbot.sendChanMessage(src, "Total: "+tteams+" pokes and "+tsets+" sets.");
        return;
    }
    else if (command == "pokecode") {
        try {
            var msg = getReadablePoke(commandData);
            sendChanHtmlMessage(src, "<table border='2'><tr><td><pre>"+msg.join("<br/>")+"</pre></td></tr></table>");
            return;
        }
        catch (err) {
            normalbot.sendChanMessage(src, "Invalid Code: "+err);
            return;
        }
    }
    else if (command == "refresh") {
        if (!bfsets.hasOwnProperty(commandData)) {
            normalbot.sendChanMessage(src, "No such pack exists!");
            return;
        }
        autoSave("teams", commandData);
        refresh(commandData);
        normalbot.sendChanMessage(src, "Refreshed the "+commandData+" pack!");
        return;
    }
    else if (command == "pokesets") {
        var tmp = commandData.split(":",2);
        var sets = [];
        var id = sys.pokeNum(tmp[0])%65536;
        var revsets = {};
        if (tmp.length == 2) {
            revsets = bfsets.hasOwnProperty(tmp[1]) ? bfsets[tmp[1]] : bfsets.preset;
        }
        else {
            revsets = bfsets.preset;
        }
        if (!revsets.hasOwnProperty(id)) {
            normalbot.sendChanMessage(src, "No sets exist for that pokemon.");
            return;
        }
        var pokesets = revsets[id];
        for (var b in pokesets) {
            try {
                if (isReadable()) {
                    sets.push(getReadablePoke(b).join("<br/>"));
                }
                else {
                    sets.push(getReadablePoke(pokesets[b]).join("<br/>"));
                }
            }
            catch (err) {
                normalbot.sendChanMessage(src, "Error (id: "+pokesets[b]+"): "+err);
            }
        }
        if (sets.length > 0) {
            sendChanHtmlMessage(src, "<table border='2'><tr><td><pre>"+sets.join("<br/><br/>")+"</pre></td></tr></table>");
        }
        return;
    }
    else if (command == "scansets" || command == "scanusersets") {
        var res = {};
        var checkfile;
        var filename = command == "scansets" ? "bfteams.json" : "bfteams_user.json";
        if (commandData.indexOf("http://") === 0 || commandData.indexOf("https://") === 0) {
            var url = commandData;
            normalbot.sendChanMessage(src, "Fetching teams from "+url+" for checking");
            sys.webCall(url, function(resp) {
                var localerr = false;
                if (resp !== "") {
                    try {
                        checkfile = JSON.parse(resp);
                        res = setlint(checkfile, true);
                    }
                    catch (err) {
                        localerr = err;
                    }
                }
                else {
                    localerr = "Web file not found: Invalid URL or web functions are not working";
                }
                if (localerr !== false) {
                    res = {'errors': ["<td>FATAL ERROR</td><td>"+localerr+"</td>"], 'warnings': [], 'suggestions': []};
                }
                if (res.errors.length > 0) {
                    sendChanHtmlMessage(src, "<table border='2' cellpadding='3'><tr><th><font color=red>ERRORS</font></th><th>"+res.errors.length+"</th></tr><tr>"+res.errors.join("</tr><tr>")+"</tr></table>");
                }
                if (res.warnings.length > 0) {
                    sendChanHtmlMessage(src, "<table border='2' cellpadding='3'><tr><th><font color=orange>WARNINGS</font></th><th>"+res.warnings.length+"</th></tr><tr>"+res.warnings.join("</tr><tr>")+"</tr></table>");
                }
                if (res.suggestions.length > 0) {
                    sendChanHtmlMessage(src, "<table border='2' cellpadding='3'><tr><th><font color=green>Suggestions</font></th><th>"+res.suggestions.length+"</th></tr><tr>"+res.suggestions.join("</tr><tr>")+"</tr></table>");
                }
                normalbot.sendChanMessage(src, "Finished checking.");
            });
        }
        else {
            try {
                if (commandData !== "") {
                    filename = commandData;
                }
                // Only allow search of bfdata directory
                var test = sys.getFileContent(dataDir+filename);
                if (test === undefined) {
                    throw "Invalid File Path: The file '"+filename+"' does not exist or could not be accessed";
                }
                checkfile = JSON.parse(test);
                res = setlint(checkfile, true);
            }
            catch (err) {
                res = {'errors': ["<td>FATAL ERROR</td><td>"+html_escape(err)+"</td>"], 'warnings': [], 'suggestions': []};
            }
            if (res.errors.length > 0) {
                sendChanHtmlMessage(src, "<table border='2' cellpadding='3'><tr><th><font color=red>ERRORS</font></th><th>"+res.errors.length+"</th></tr><tr>"+res.errors.join("</tr><tr>")+"</tr></table>");
            }
            if (res.warnings.length > 0) {
                sendChanHtmlMessage(src, "<table border='2' cellpadding='3'><tr><th><font color=orange>WARNINGS</font></th><th>"+res.warnings.length+"</th></tr><tr>"+res.warnings.join("</tr><tr>")+"</tr></table>");
            }
            if (res.suggestions.length > 0) {
                sendChanHtmlMessage(src, "<table border='2' cellpadding='3'><tr><th><font color=green>Suggestions</font></th><th>"+res.suggestions.length+"</th></tr><tr>"+res.suggestions.join("</tr><tr>")+"</tr></table>");
            }
            normalbot.sendChanMessage(src, "Finished checking.");
        }
        return;
    }
    else if (command == "bfversion") {
        var tfile = bfsets.hasOwnProperty(commandData) ? bfsets[commandData] : bfsets.preset;
        var tteams = 0;
        var tsets = 0;
        var pokes = [];
        var info = "NO_NAME";
        if (tfile.hasOwnProperty('desc')) {
            if (typeof tfile.desc == "string") {
                info = tfile.desc;
            }
        }
        for (var t in tfile) {
            if (typeof tfile[t] != "object") {
                continue;
            }
            var poke = sys.pokemon(parseInt(t, 10));
            tteams += 1;
            var setlength = 0;
            if (isReadable()) {
                var lteams = tfile[t];
                for (var k in lteams) {
                    setlength += 1;
                }
            }
            else {
                setlength = tfile[t].length;
            }
            tsets += setlength;
            pokes.push(poke);
        }
        pokes.sort();
        normalbot.sendChanMessage(src, "Installed Pokemon: "+pokes.join(", "));
        normalbot.sendChanMessage(src, "Total: "+tteams+" pokes and "+tsets+" sets.");
        normalbot.sendChanMessage(src, "Team Pack Description: "+info);
        return;
    }
    else if (command == "viewpacks") {
        var table = "<table><tr><th colspan=4>Battle Factory Packs</th></tr><tr><th>Name</th><th>Enabled</th><th>Working</th><th>URL</th></tr>";
        for (var h in bfhash) {
            table += "<tr><td>"+html_escape(h)+"</td><td>"+(bfhash[h].active ? "Yes" : "No")+"</td><td>"+(bfhash[h].enabled ? "Yes" : "No")+"</td><td>"+(bfhash[h].hasOwnProperty('url') ? "<a href="+bfhash[h].url+">"+html_escape(bfhash[h].url)+"</a></td></tr>" : "Not Specified");
        }
        table += "</table>"
        sys.sendHtmlMessage(src,table,channel);
        return;
    }
    else if (command == "submitsets") {
        // This will export the first team to a submission queue
        cleanEntries(); // clean out any invalid entries
        if (!sys.dbRegistered(sys.name(src))) {
            normalbot.sendChanMessage(src, "You need to register to submit sets.");
            return;
        }
        if (submitbans.hasOwnProperty(sys.ip(src))) {
            normalbot.sendChanMessage(src, "You are banned from submitting sets!");
            return;
        }
        var submittier = sys.tier(src, 0);
        if (["Wifi Ubers", "Wifi OU", "Wifi UU", "Wifi LU", "Wifi NU", "Wifi LC", "Middle Cup"].indexOf(submittier) == -1) {
            normalbot.sendChanMessage(src, "No submissions are allowed for those tiers!");
            return;
        }
        var submissions = 0;
        for (var q in userqueue) {
            if (userqueue[q].ip == sys.ip(src) || userqueue[q].name == sys.name(src)) {
                submissions += 1;
            }
        }
        var maxsubmissions = sys.auth(src) >= 1 ? 100 : 15;
        if (sys.auth(src) < 2 && submissions >= maxsubmissions) {
            normalbot.sendChanMessage(src, "You already have "+maxsubmissions+" or more submissions in the queue, please wait until they get reviewed!");
            return;
        }
        var team = [];
        for (var x=0;x<6;x++) {
            var pokecode = "";
            var poke = sys.teamPoke(src, 0, x);
            if (poke === 0) { // don't export missingno.
                continue;
            }
            if (poke === sys.pokeNum('Ditto')) {
                normalbot.sendChanMessage(src, "Ditto is not able to be submitted.");
                continue;
            }
            // This accounts for formes
            var pokenum = poke%65536;
            var formnum = Math.floor(poke/65536);
            var nature = sys.teamPokeNature(src, 0, x);
            var ability = sys.teamPokeAbility(src, 0, x);
            var item = sys.teamPokeItem(src, 0, x);
            var level = sys.teamPokeLevel(src, 0, x);
            if (['Middle Cup'].indexOf(submittier) > -1 && level > 50) {
                normalbot.sendChanMessage(src, sys.pokemon(poke) + " must not be above Level 50 for Middle Cup.");
                continue;
            }
            if (['Wifi LC'].indexOf(submittier) > -1 && level > 5) {
                normalbot.sendChanMessage(src, sys.pokemon(poke) + " must not be above Level 5 for Little Cup.");
                continue;
            }
            if (['Random Battle'].indexOf(submittier) > -1 && level > 50) {
                normalbot.sendChanMessage(src, sys.pokemon(poke) + " was scaled down to Level 50 for Random Battle.");
                level = 50;
            }
            pokecode = pokecode + toChars(pokenum,2) + toChars(formnum,1) + toChars(nature,1) + toChars(ability,2) + toChars(item,3) + toChars(level,2);
            var movelist = [];
            for (var m=0; m<4; m++) {
                var move = sys.teamPokeMove(src, 0, x, m);
                var bannedmoves = ['Double Team', 'Minimize', 'Guillotine', 'Horn Drill', 'Sheer Cold', 'Fissure'];
                if (bannedmoves.indexOf(sys.move(move)) > -1 && submittier != "Random Battle") {
                    normalbot.sendChanMessage(src, "The move "+sys.move(move)+" is not allowed in this tier!");
                    continue;
                }
                movelist.push(sys.move(move));
                pokecode = pokecode + toChars(move, 2);
            }
            var evlist = [];
            for (var e=0; e<6; e++) {
                var ev = sys.teamPokeEV(src, 0, x, e);
                evlist.push(ev);
                pokecode = pokecode + toChars(ev, 2);
            }
            var dvlist = [];
            for (var d=0; d<6; d++) {
                var dv = sys.teamPokeDV(src, 0, x, d);
                dvlist.push(dv);
                pokecode = pokecode + toChars(dv, 1);
            }
            var gender = sys.teamPokeGender(src, 0, x);
            pokecode = pokecode + toChars(gender, 1);
            team.push(pokecode);
        }
        // Write the short code for export
        if (team.length === 0) {
            normalbot.sendChanMessage(src, "You have no Pokemon!");
            return;
        }
        for (var s in team) {
            var submission = {
                'ip': sys.ip(src),
                'name': sys.name(src),
                'sets': [team[s]],
                'tier': submittier
            };
            userqueue.push(submission);
        }
        normalbot.sendChanMessage(src, "Submitted your sets. See your submission below.");
        normalbot.sendAll(sys.name(src)+" submitted some "+submittier+" sets for Battle Factory.", teamrevchan);
        var sets = [];
        for (var b in team) {
            sets.push(getReadablePoke(team[b]).join("<br/>"));
        }
        sendChanHtmlMessage(src, "<table border='2'><tr><td><pre>"+sets.join("<br/><br/>")+"</pre></td></tr></table>");
        return;
    }
    else if (command == 'checkqueue') {
        if (userqueue.length === 0) {
            normalbot.sendChanMessage(src, "Nothing in the queue.");
            return;
        }
        seeQueueItem(0);
        return;
    }
    else if (command == 'acceptset') {
        if (userqueue.length === 0) {
            normalbot.sendChanMessage(src, "Nothing in the queue.");
            return;
        }
        var accept = userqueue[0];
        if (accept.ip == sys.ip(src) && !isReviewAdmin(src)) {
            normalbot.sendChanMessage(src, "Can't accept your own sets.");
            return;
        }
        if (!isTierReviewer(src, accept.tier)) {
            normalbot.sendChanMessage(src, "You are not authorised to review "+accept.tier+" sets.");
            return;
        }
        var srctier = accept.tier;
        if (!bfsets.hasOwnProperty(srctier)) {
            normalbot.sendChanMessage(src, "No sets can be accepted for that tier.");
            return;
        }
        normalbot.sendAll(accept.name+"'s submission was accepted by "+sys.name(src),teamrevchan);
        var teamsave = bfsets[srctier];
        var team = accept.sets;
        // Write the short code
        for (var g in team) {
            var set = team[g];
            var species = toNumber(set.substr(0,2));
            if (teamsave.hasOwnProperty(species)) {
                if (teamsave[species].indexOf(set) == -1) {
                    teamsave[species].push(set);
                }
                continue;
            }
            else {
                teamsave[species] = [set];
            }
        }
        bfsets[srctier] = teamsave;
        userqueue.splice(0,1);
        seeQueueItem(0);
        return;
    }
    else if (command == 'rejectset') {
        if (userqueue.length === 0) {
            normalbot.sendChanMessage(src, "Nothing in the queue.");
            return;
        }
        var reject = userqueue[0];
        // Maybe change the reject mechanics?
        if (!isTierReviewer(src, reject.tier) && reject.name != sys.name(src)) {
            normalbot.sendChanMessage(src, "You are not authorised to review "+accept.tier+" sets.");
            return;
        }
        normalbot.sendChanMessage(src, "You rejected the current set.");
        normalbot.sendAll(reject.name+"'s submission was rejected by "+sys.name(src),teamrevchan);
        userqueue.splice(0,1);
        seeQueueItem(0);
        return;
    }
    else if (command == 'nextset') {
        var shift = (userqueue.splice(0,1))[0];
        userqueue.push(shift);
        seeQueueItem(0);
        return;
    }
    else if (command == 'savesets') {
        autoSave("all", "");
        normalbot.sendChanMessage(src, "Saved user generated sets!");
        return;
    }
    else if (command == 'deleteset') {
        var found = false;
        var tmp = commandData.split(":", 2);
        if (tmp.length != 2) {
            normalbot.sendChanMessage(src, "Usage: /deleteset [pack name]:[code]");
            return;
        }
        if (!bfsets.hasOwnProperty(tmp[0])) {
            normalbot.sendChanMessage(src, "No such pack exists!");
            return;
        }
        var deletesets = bfsets[tmp[0]];
        for (var u in deletesets) {
            var setlist = deletesets[u];
            var index = setlist.indexOf(tmp[1]);
            if (index > -1) {
                setlist.splice(index,1);
                if (setlist.length === 0) {
                    delete deletesets[u];
                }
                else {
                    deletesets[u] = setlist;
                }
                found = true;
            }
        }
        if (!found) {
            normalbot.sendChanMessage(src, "No such set exists!");
            return;
        }
        var deletemsg = getReadablePoke(tmp[1]);
        bfsets[tmp[0]] = deletesets;
        sendChanHtmlAll("<table border='2'><tr><td style='background-color:#ff7777;'><pre>"+deletemsg.join("<br/>")+"</pre></td></tr></table>",teamrevchan);
        normalbot.sendAll(sys.name(src)+" deleted set id "+tmp[1]+" from "+tmp[0]+"!", teamrevchan);
        return;
    }
    else if (command == 'submitbans') {
        sendChanMessage(src, "*** SUBMIT BANS ***");
        for (var j in submitbans) {
            sendChanMessage(src, submitbans[j].user+": Banned by "+submitbans[j].auth);
        }
        sendChanMessage(src, "*** END OF SUBMIT BANS ***");
    }
    else if (command == 'submitban') {
        if (commandData === "") {
            normalbot.sendChanMessage(src, "Must specify a user!");
            return;
        }
        var target = commandData;
        var tarip = sys.dbIp(target);
        if (tarip === undefined) {
            normalbot.sendChanMessage(src, "No such user.");
            return;
        }
        var maxAuth = sys.maxAuth(sys.dbIp(target));
        if (maxAuth >= 1) {
            normalbot.sendChanMessage(src, "Can't submit ban auth.");
            return;
        }
        if (submitbans.hasOwnProperty(tarip)) {
            normalbot.sendChanMessage(src, commandData+" is already banned from submitting!");
            return;
        }
        submitbans[tarip] = {'user': commandData.toLowerCase(), 'auth': sys.name(src)};
        normalbot.sendAll(commandData+" was banned from submitting sets by "+sys.name(src)+"!",teamrevchan);
        sys.writeToFile(submitDir+"bans.json", JSON.stringify(submitbans));
        return;
    }
    else if (command == 'submitunban') {
        if (commandData === "") {
            normalbot.sendChanMessage(src, "Must specify a user!");
            return;
        }
        var target = commandData;
        var tarip = sys.dbIp(target);
        if (tarip === undefined) {
            normalbot.sendChanMessage(src, "No such user.");
            return;
        }
        if (!submitbans.hasOwnProperty(tarip)) {
            normalbot.sendChanMessage(src, commandData+" is not banned from submitting!");
            return;
        }
        delete submitbans[tarip];
        normalbot.sendAll(commandData+" was unbanned from submitting sets by "+sys.name(src)+"!",teamrevchan);
        sys.writeToFile(submitDir+"bans.json", JSON.stringify(submitbans));
        return;
    }
    else if (command == 'addreviewer') {
        var tmp = commandData.split(":", 2);
        if (tmp.length != 2) {
            normalbot.sendChanMessage(src, "Usage: /addreviewer [name]:[tier] (tier is case sensitive)");
            return;
        }
        if (!reviewers.hasOwnProperty(tmp[1])) {
            normalbot.sendChanMessage(src, "You can't add reviewers for that tier!");
            return;
        }
        if (sys.dbIp(tmp[0]) === undefined) {
            normalbot.sendChanMessage(src, "No such user.");
            return;
        }
        if (!sys.dbRegistered(tmp[0])) {
            normalbot.sendChanMessage(src, "Reviewers must be registered!");
            return;
        }
        var tierrev = reviewers[tmp[1]];
        for (var v in tierrev) {
            if (tmp[0].toLowerCase() === tierrev[v].toLowerCase()) {
                normalbot.sendChanMessage(src, "They are already a reviewer!");
                return;
            }
        }
        reviewers[tmp[1]].push(tmp[0]);
        normalbot.sendAll(sys.name(src)+" made "+tmp[0]+" an approved reviewer of "+tmp[1]+"!",teamrevchan);
        sys.writeToFile(submitDir+"reviewers.json", JSON.stringify(reviewers));
    }
    else if (command == 'removereviewer') {
        var tmp = commandData.split(":", 2);
        if (tmp.length != 2) {
            normalbot.sendChanMessage(src, "Usage: /removereviewer [name]:[tier] (tier is case sensitive)");
            return;
        }
        if (!reviewers.hasOwnProperty(tmp[1])) {
            normalbot.sendChanMessage(src, "You can't remove reviewers for that tier!");
            return;
        }
        var tierrev = reviewers[tmp[1]];
        var removed = false;
        for (var v in tierrev) {
            if (tmp[0].toLowerCase() === tierrev[v].toLowerCase()) {
                removed = true;
                var removeindex = reviewers[tmp[1]].indexOf(tierrev[v]);
                reviewers[tmp[1]].splice(removeindex, 1);
            }
        }
        if (removed) {
            normalbot.sendAll(sys.name(src)+" fired "+tmp[0]+" from reviewing "+tmp[1]+"!",teamrevchan);
            sys.writeToFile(submitDir+"reviewers.json", JSON.stringify(reviewers));
        }
        else {
            normalbot.sendChanMessage(src, "They are not a reviewer!");
        }
        return;
    }
    else if (command == 'reviewers') {
        sys.sendMessage(src, "*** Current Reviewers ***", channel);
        for (var r in reviewers) {
            sys.sendMessage(src, r+": "+reviewers[r].join(", "));
        }
    }
    else return 'no command';
}

// Set file checking
function setlint(checkfile, strict) {
    var errors = [];
    var warnings = [];
    var suggestions = [];
    if (checkfile.hasOwnProperty('desc')) {
        if (typeof checkfile.desc !== "string") {
            warnings.push("<td>Description</td><td>desc property must be a string</td>");
        }
    }
    else {
        suggestions.push("<td>Description</td><td>desc property can be used to give a description for your team pack</td>");
    }
    var readable = false;
    if (checkfile.hasOwnProperty("readable")) {
        if (checkfile.readable === true) {
            readable = true;
        }
    }
    var stats = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"];
    for (var x in checkfile) {
        var setinfo = checkfile[x];
        if (typeof setinfo !== 'object') {
            if (["readable", "desc"].indexOf(x) == -1) {
                warnings.push("<td>Bad property</td><td>'"+html_escape(x)+"' property must be an object</td>");
            }
            continue;
        }
        if (readable) {
            var sets = checkfile[x];
            var available = [];
            var setids = [];
            for (var t in sets) {
                if (typeof sets[t] !== "object") {
                    errors.push("<td>Bad set property</td><td>Property '"+html_escape(x)+"'; set "+t+": properties of it must be an object</td>");
                    continue;
                }
                available.push(sets[t]);
                setids.push(t);
            }
            for (var j in available) {
                var prop = available[j];
                var sid = setids[j];
                for (var p in prop) {
                    if (['poke', 'nature', 'ability', 'item'].indexOf(p) != -1) {
                        if (typeof prop[p] !== "string") {
                            errors.push("<td>Bad set property</td><td>Property '"+html_escape(x)+"'; set "+sid+": property '"+p+"' must be a string</td>");
                        }
                    }
                    else if (['level', 'gender'].indexOf(p) != -1) {
                        if (typeof prop[p] !== "number") {
                            errors.push("<td>Bad set property</td><td>Property '"+html_escape(x)+"'; set "+sid+": property '"+p+"' must be a number</td>");
                        }
                        else if ([0,1,2].indexOf(prop.gender) == -1) {
                            errors.push("<td>Bad set property</td><td>Property '"+html_escape(x)+"'; set "+sid+": gender property must be 0, 1 or 2</td>");
                        }
                        else if (prop.level < 1 || prop.level > 100) {
                            errors.push("<td>Bad set property</td><td>Property '"+html_escape(x)+"'; set "+sid+": level property must be an integer between 1 and 100 (inclusive)</td>");
                        }
                    }
                    else if (['moves', 'evs', 'dvs'].indexOf(p) != -1) {
                        if (typeof prop[p] !== "object") {
                            errors.push("<td>Bad set property</td><td>Property '"+html_escape(x)+"'; set "+sid+": property '"+p+"' must be an array</td>");
                        }
                        else {
                            if (p == 'moves' && prop[p].length != 4) {
                                errors.push("<td>Bad set property</td><td>Property '"+html_escape(x)+"'; set "+sid+": property '"+p+"' must be an array of length 4</td>");
                            }
                            if (['evs', 'dvs'].indexOf(p) != -1 && prop[p].length != 6) {
                                errors.push("<td>Bad set property</td><td>Property '"+html_escape(x)+"'; set "+sid+": property '"+p+"' must be an array of length 6</td>");
                            }
                            else if (p == 'dvs'){
                                var dvlist = prop.dvs;
                                for (var d in dvlist) {
                                    if (typeof dvlist[d] !== "number" || dvlist[d] < 0 || dvlist[d] > 31) {
                                        errors.push("<td>Bad set property</td><td>Property '"+html_escape(x)+"'; set "+sid+"; property '"+p+"'; array values must be integers between 0 and 31 inclusive.</td>");
                                    }
                                }
                            }
                            else if (p == 'evs'){
                                var evlist = prop.evs;
                                var evsum = 0;
                                for (var e in evlist) {
                                    if (typeof evlist[e] !== "number" || evlist[e] < 0 || evlist[e] > 255) {
                                        errors.push("<td>Bad set property</td><td>Property '"+html_escape(x)+"'; set "+sid+"; property '"+p+"'; array values must be integers between 0 and 255 inclusive.</td>");
                                    }
                                    else {
                                        evsum += evlist[e];
                                    }
                                }
                                if (evsum > 510) {
                                    errors.push("<td>Bad set property</td><td>Property '"+html_escape(x)+"'; set "+sid+"; property '"+p+"'; maximum sum of EVs must not exceed 510.</td>");
                                }
                            }
                            else {
                                var moves = prop.moves;
                                for (var m in moves) {
                                    if (typeof moves[m] !== "string") {
                                        errors.push("<td>Bad set property</td><td>Property '"+html_escape(x)+"'; set "+sid+"; property '"+p+"'; array values must be strings.</td>");
                                    }
                                }
                            }
                        }
                    }
                    else {
                        warnings.push("<td>Unused Property</td><td>Property '"+html_escape(x)+"'; set "+sid+": unused property '"+p+"'</td>");
                    }
                }
                var iserr = false;
                var reqprops = ['poke', 'nature', 'ability', 'item', 'level', 'moves', 'evs', 'dvs', 'gender'];
                for (var a in reqprops) {
                    if (!prop.hasOwnProperty(reqprops[a])) {
                        errors.push("<td>Missing property</td><td>Property '"+html_escape(x)+"'; set "+sid+": property '"+reqprops[a]+"' is missing</td>");
                        iserr = true;
                    }
                }
                if (iserr) {
                    continue;
                }
                var testprop = {
                    'poke': sys.pokeNum(prop.poke),
                    'nature': sys.natureNum(prop.nature),
                    'ability': sys.abilityNum(prop.ability),
                    'item': sys.itemNum(prop.item),
                    'level': prop.level,
                    'moves': [sys.moveNum(prop.moves[0]),sys.moveNum(prop.moves[1]),sys.moveNum(prop.moves[2]),sys.moveNum(prop.moves[3])],
                    'evs': prop.evs,
                    'dvs': prop.dvs,
                    'gender': prop.gender
                };
                if (testprop.poke === 0 || testprop.poke === undefined) {
                    errors.push("<td>Missing Poke</td><td>Property '"+html_escape(x)+"'; set "+sid+": Pokemon detected was Missingno.</td>");
                }
                if (testprop.item === 0 || testprop.item === undefined) {
                    warnings.push("<td>Missing Item</td><td>Property '"+html_escape(x)+"'; set "+sid+": Not holding an item.</td>");
                }
                var nummoves = 0;
                for (var mm = 0; mm < 4; mm++) {
                    if (testprop.moves[mm] === 0 || testprop.moves[mm] === undefined) {
                        warnings.push("<td>Missing Move</td><td>Property '"+html_escape(x)+"'; set "+sid+": Moveslot "+(mm+1)+" is empty.</td>");
                    }
                    else {
                        nummoves += 1;
                    }
                }
                if (nummoves === 0) {
                    errors.push("<td>No Moves</td><td>Property '"+html_escape(x)+"'; set "+sid+": Pokemon has no moves.</td>");
                }
                var ttlevsum = 0;
                for (var ee in testprop.evs) {
                    if (testprop.evs[ee]%4 !== 0) {
                        warnings.push("<td>Wasted EVs</td><td>Property '"+html_escape(x)+"'; set "+sid+": EVs for "+stats[ee]+" are wasted. (Use a multiple of 4)</td>");
                    }
                    ttlevsum += testprop.evs[ee];
                }
                if (ttlevsum < 508) {
                    warnings.push("<td>Unassigned EVs</td><td>Property '"+html_escape(x)+"'; set "+sid+": This Pokemon could have more EVs.</td>");
                }
            }
        }
        else {
            var csets = checkfile[x];
            var cavailable = [];
            for (var ct in csets) {
                if (typeof csets[ct] !== "string") {
                    errors.push("<td>Bad set</td><td>Property '"+html_escape(x)+"'; array elements must be 38 character alphanumeric strings</td>");
                    continue;
                }
                cavailable.push(csets[ct]);
            }
            for (var k in cavailable) {
                var set = cavailable[k];
                if (set.length != 38) {
                    errors.push("<td>Bad set</td><td>Property '"+html_escape(x)+"'; array elements must be 38 character alphanumeric strings</td>");
                    continue;
                }
                var ctestprop = {
                    'poke': sys.pokemon(toNumber(set.substr(0,2))+65536*toNumber(set.substr(2,1))),
                    'nature': sys.nature(toNumber(set.substr(3,1))),
                    'ability': sys.ability(toNumber(set.substr(4,2))),
                    'item': sys.item(toNumber(set.substr(6,3))),
                    'level': toNumber(set.substr(9,2)),
                    'moves': [sys.move(toNumber(set.substr(11,2))),sys.move(toNumber(set.substr(13,2))),sys.move(toNumber(set.substr(15,2))),sys.move(toNumber(set.substr(17,2)))],
                    'evs': [toNumber(set.substr(19,2)),toNumber(set.substr(21,2)),toNumber(set.substr(23,2)),toNumber(set.substr(25,2)),toNumber(set.substr(27,2)),toNumber(set.substr(29,2))],
                    'dvs': [toNumber(set.substr(31,1)),toNumber(set.substr(32,1)),toNumber(set.substr(33,1)),toNumber(set.substr(34,1)),toNumber(set.substr(35,1)),toNumber(set.substr(36,1))],
                    'gender': toNumber(set.substr(37,1))
                };
                if (ctestprop.poke === sys.pokemon(0) || ctestprop.poke === undefined) {
                    errors.push("<td>Missing Poke</td><td>Property '"+html_escape(x)+"'; set "+set+": Pokemon detected was Missingno.</td>");
                }
                if (ctestprop.level < 1 || ctestprop.level > 100) {
                    errors.push("<td>Level out of range</td><td>Property '"+html_escape(x)+"'; set "+set+": level must be an integer between 1 and 100 (inclusive)</td>");
                }
                if ([0,1,2].indexOf(ctestprop.gender) == -1) {
                    errors.push("<td>Invalid Gender</td><td>Property '"+html_escape(x)+"'; set "+t+": gender property must be 0, 1 or 2</td>");
                }
                if (ctestprop.item === sys.item(0) || ctestprop.item === undefined) {
                    warnings.push("<td>Missing Item</td><td>Property '"+html_escape(x)+"'; set "+set+": Not holding an item.</td>");
                }
                if (ctestprop.nature === undefined) {
                    errors.push("<td>Invalid Nature</td><td>Property '"+html_escape(x)+"'; set "+set+": This set has an invalid nature.</td>");
                }
                if ([sys.nature(0), sys.nature(6), sys.nature(12), sys.nature(18), sys.nature(24)].indexOf(ctestprop.nature) > -1) {
                    suggestions.push("<td>Neutral Nature?</td><td>Property '"+html_escape(x)+"'; set "+set+": This set has a Neutral Nature (may not be what you intend).</td>");
                }
                var cnummoves = 0;
                for (var cm = 0; cm < 4; cm++) {
                    if (ctestprop.moves[cm] === sys.move(0) || ctestprop.moves[cm] === undefined) {
                        warnings.push("<td>Missing Move</td><td>Property '"+html_escape(x)+"'; set "+set+": Moveslot "+(cm+1)+" is empty.</td>");
                    }
                    else {
                        cnummoves += 1;
                    }
                }
                if (cnummoves === 0) {
                    errors.push("<td>No Moves</td><td>Property '"+html_escape(x)+"'; set "+set+": Pokemon has no moves.</td>");
                }
                var cttlevsum = 0;
                for (var ce in ctestprop.evs) {
                    if (typeof ctestprop.evs[ce] !== "number" || ctestprop.evs[ce] < 0 || ctestprop.evs[ce] > 255) {
                        errors.push("<td>Bad EV Amount</td><td>Property '"+html_escape(x)+"'; set "+set+"; stat "+stats[ce]+" : EVs must be integers between 0 and 255 inclusive.</td>");
                    }
                    else if (ctestprop.evs[ce]%4 !== 0) {
                        warnings.push("<td>Wasted EVs</td><td>Property '"+html_escape(x)+"'; set "+set+": EVs for "+stats[ce]+" are wasted. (Use a multiple of 4)</td>");
                        cttlevsum += ctestprop.evs[ce];
                    }
                    else {
                        cttlevsum += ctestprop.evs[ce];
                    }
                }
                if (cttlevsum > 510) {
                    errors.push("<td>Too many EVs</td><td>Property '"+html_escape(x)+"'; set "+set+"; maximum sum of EVs must not exceed 510.</td>");
                }
                else if (cttlevsum < 508) {
                    warnings.push("<td>Unassigned EVs</td><td>Property '"+html_escape(x)+"'; set "+set+": This Pokemon could have more EVs.</td>");
                }
                for (var cd in ctestprop.dvs) {
                    if (typeof ctestprop.dvs[cd] !== "number" || ctestprop.dvs[cd] < 0 || ctestprop.dvs[cd] > 31) {
                        errors.push("<td>Bad EV Amount</td><td>Property '"+html_escape(x)+"'; set "+set+"; stat "+stats[cd]+" : IVs must be integers between 0 and 31 inclusive.</td>");
                    }
                }
            }
        }
    }
    if (errors.length > 100) {
        errors = errors.slice(0,100);
        errors.push("<td>TOO MANY ERRORS</td><td>There are more than 100 errors in this file.</td>");
    }
    if (warnings.length > 100) {
        warnings = warnings.slice(0,100);
        errors.push("<td>TOO MANY WARNINGS</td><td>There are more than 100 warnings in this file.</td>");
    }
    return {'errors': errors, 'warnings': warnings, 'suggestions': suggestions};
}

function getReadablePoke(set) {
    if (set.length != 38) {
        throw "Invalid Set, each set should be 38 alphanumeric characters long.";
    }
    var info = {
        'poke': sys.pokemon(toNumber(set.substr(0,2))+65536*toNumber(set.substr(2,1))),
        'nature': sys.nature(toNumber(set.substr(3,1))),
        'ability': sys.ability(toNumber(set.substr(4,2))),
        'item': sys.item(toNumber(set.substr(6,3))),
        'level': toNumber(set.substr(9,2)),
        'moves': [sys.move(toNumber(set.substr(11,2))),sys.move(toNumber(set.substr(13,2))),sys.move(toNumber(set.substr(15,2))),sys.move(toNumber(set.substr(17,2)))],
        'evs': [toNumber(set.substr(19,2)),toNumber(set.substr(21,2)),toNumber(set.substr(23,2)),toNumber(set.substr(25,2)),toNumber(set.substr(27,2)),toNumber(set.substr(29,2))],
        'dvs': [toNumber(set.substr(31,1)),toNumber(set.substr(32,1)),toNumber(set.substr(33,1)),toNumber(set.substr(34,1)),toNumber(set.substr(35,1)),toNumber(set.substr(36,1))],
        'gender': toNumber(set.substr(37,1))
    };
    var genders = ['', '(M) ', '(F) '];
    var stats = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"];
    var msg = [set, info.poke+" "+genders[info.gender]+"@ "+info.item];
    msg.push("Ability: "+info.ability, info.nature+" Nature, Level "+info.level);
    var evlist = [];
    var dvlist = [];
    for (var j in info.evs) {
        if (info.evs[j] > 0) {
            evlist.push(info.evs[j]+" "+stats[j]);
        }
    }
    for (var k in info.dvs) {
        if (info.dvs[k] < 31) {
            dvlist.push(info.dvs[k]+" "+stats[k]);
        }
    }
    if (dvlist.length === 0) {
        dvlist = ["All 31"];
    }
    msg.push(info.moves.join(" / "),"EVs: "+evlist.join(" / "),"IVs: "+dvlist.join(" / "));
    if (info.moves.indexOf("Hidden Power") != -1) {
        var hptype = sys.hiddenPowerType(5,info.dvs[0],info.dvs[1],info.dvs[2],info.dvs[3],info.dvs[4],info.dvs[5]);
        msg.push("Hidden Power "+sys.type(hptype));
    }
    return msg;
}


// Gets stat boost/drop of natures
// 1=Atk, 2=Def, 3=SpA, 4=SpD, 5=Spe
// reutnrs [up, down] or "";
function getNature(nature) {
    var naturetable = {
        'Hardy': [0,0],
        'Lonely': [1,2],
        'Brave': [1,5],
        'Adamant': [1,3],
        'Naughty': [1,4],
        'Bold': [2,1],
        'Docile': [0,0],
        'Relaxed': [2,5],
        'Impish': [2,3],
        'Lax': [2,4],
        'Timid': [5,1],
        'Hasty': [5,2],
        'Serious': [0,0],
        'Jolly': [5,3],
        'Naive': [5,4],
        'Modest': [3,1],
        'Mild': [3,2],
        'Quiet': [3,5],
        'Bashful': [0,0],
        'Rash': [3,4],
        'Calm': [4,1],
        'Gentle': [4,2],
        'Sassy': [4,5],
        'Careful': [4,3],
        'Quirky': [0,0]
    };
    return naturetable[nature];
}

// This gets the stats for a Pokemon
function getStats(src, team, poke) {
    var movelist = [];
    for (var m=0; m<4; m++) {
        var move = sys.teamPokeMove(src, team, poke, m);
        movelist.push(sys.move(move));
    }
    var evlist = [];
    for (var e=0; e<6; e++) {
        var ev = sys.teamPokeEV(src, team, poke, e);
        evlist.push(ev);
    }
    var dvlist = [];
    for (var d=0; d<6; d++) {
        var dv = sys.teamPokeDV(src, team, poke, d);
        dvlist.push(dv);
    }
    var genders = ["", "(M) ", "(F) "];
    var info = {
        'poke': sys.pokemon(sys.teamPoke(src,team,poke)),
        'species': sys.pokemon(sys.teamPoke(src,team,poke)%65536),
        'nature': sys.nature(sys.teamPokeNature(src,team,poke)),
        'ability': sys.ability(sys.teamPokeAbility(src,team,poke)),
        'item': sys.item(sys.teamPokeItem(src,team,poke)),
        'level': sys.teamPokeLevel(src,team,poke),
        'moves': movelist,
        'evs': evlist,
        'dvs': dvlist,
        'gender': genders[sys.teamPokeGender(src,team,poke)]
    };
    var stats = ["HP", "Attack", "Defense", "Sp.Atk", "Sp.Def", "Speed"];
    var statlist = [];
    var pokeinfo = [];
    if (pokedb.hasOwnProperty(info.poke)) {
        pokeinfo = pokedb[info.poke];
    }
    else if (pokedb.hasOwnProperty(info.species)) {
        pokeinfo = pokedb[info.species];
    }
    else {
        throw "UNHANDLED EXCEPTION: Pokeinfo not found";
    }
    for (var s=0; s<6; s++) {
        var natureboost = getNature(info.nature);
        if (s === 0) { // HP Stat
            if (pokeinfo[s] == 1) { // Shedinja
                statlist.push("1 HP");
            }
            else {
                var hstat = 10 + Math.floor(Math.floor(info.dvs[s]+2*pokeinfo[s]+info.evs[s]/4+100)*info.level/100);
                statlist.push(hstat+" HP");
            }
        }
        else {
            var bstat = 5 + Math.floor(Math.floor(info.dvs[s]+2*pokeinfo[s]+info.evs[s]/4)*info.level/100);
            var newstat = 0;
            if (natureboost[0] === s) {
                newstat = Math.floor(bstat*1.1);
            }
            else if (natureboost[1] === s) {
                newstat = Math.floor(bstat*0.9);
            }
            else {
                newstat = bstat;
            }
            statlist.push(newstat+" "+stats[s]);
        }
    }
    var msg = [];
    msg.push(info.poke+" "+info.gender+"@ "+info.item+"; Ability: "+info.ability+"; "+info.nature+" Nature; Level "+info.level)
    msg.push(info.moves.join(" / "),"Stats: "+statlist.join(" / "));
    return msg;
}

function generateTeam(src, team, mode) {
    try {
        var pokedata = bfsets.hasOwnProperty(mode) ? bfsets[mode] : bfsets.preset;
        var teaminfo = [];
        var pokearray = [];
        var readable = isReadable();
        for (var x in pokedata) {
            if (typeof pokedata[x] == "object") {
                pokearray.push(x);
            }
        }
        for (var p=0;p<6;p++) {
            if (pokearray.length === 0) {
                normalbot.sendAll("Team file was empty or corrupt, could not import.", staffchannel);
                return;
            }
            var pokes = pokearray.splice(sys.rand(0, pokearray.length),1);
            var sets = pokedata[pokes];
            if (readable) {
                var available = [];
                for (var t in sets) {
                    available.push(sets[t]);
                }
                var prop = available[sys.rand(0, available.length)]
                teaminfo[p] = {
                    'poke': sys.pokeNum(prop.poke),
                    'nature': sys.natureNum(prop.nature),
                    'ability': sys.abilityNum(prop.ability),
                    'item': sys.itemNum(prop.item),
                    'level': prop.level,
                    'moves': [sys.moveNum(prop.moves[0]),sys.moveNum(prop.moves[1]),sys.moveNum(prop.moves[2]),sys.moveNum(prop.moves[3])],
                    'evs': prop.evs,
                    'dvs': prop.dvs,
                    'gender': prop.gender
                };
            }
            else {
                var set = sets[sys.rand(0, sets.length)]
                teaminfo[p] = {
                    'poke': toNumber(set.substr(0,2))+65536*toNumber(set.substr(2,1)),
                    'nature': toNumber(set.substr(3,1)),
                    'ability': toNumber(set.substr(4,2)),
                    'item': toNumber(set.substr(6,3)),
                    'level': toNumber(set.substr(9,2)),
                    'moves': [toNumber(set.substr(11,2)),toNumber(set.substr(13,2)),toNumber(set.substr(15,2)),toNumber(set.substr(17,2))],
                    'evs': [toNumber(set.substr(19,2)),toNumber(set.substr(21,2)),toNumber(set.substr(23,2)),toNumber(set.substr(25,2)),toNumber(set.substr(27,2)),toNumber(set.substr(29,2))],
                    'dvs': [toNumber(set.substr(31,1)),toNumber(set.substr(32,1)),toNumber(set.substr(33,1)),toNumber(set.substr(34,1)),toNumber(set.substr(35,1)),toNumber(set.substr(36,1))],
                    'gender': toNumber(set.substr(37,1))
                };
            }
        }
        for (var s=0;s<6;s++) {
            var pdata = teaminfo[s];
            sys.changePokeNum(src,team,s,pdata.poke);
            sys.changePokeName(src,team,s,sys.pokemon(pdata.poke))
            sys.changePokeNature(src,team,s,pdata.nature);
            sys.changePokeAbility(src,team,s,pdata.ability);
            sys.changePokeItem(src,team,s,pdata.item);
            for (var m=0;m<4;m++) {
                sys.changePokeMove(src,team,s,m,pdata.moves[m]);
            }
            for (var c=0;c<6;c++) {
                sys.changeTeamPokeEV(src,team,s,c,0); // this resets the EV count
            }
            for (var e=0;e<6;e++) {
                sys.changeTeamPokeEV(src,team,s,e,pdata.evs[e]);
            }
            for (var d=0;d<6;d++) {
                sys.changeTeamPokeDV(src,team,s,d,pdata.dvs[d]);
            }
            var happiness = sys.rand(0,256);
            // maximise happiness if the poke has Return, minmise if it has frustration
            if (sys.hasTeamPokeMove(src, team, s, sys.moveNum('Return'))) {
                happiness = 255;
            }
            else if (sys.hasTeamPokeMove(src, team, s, sys.moveNum('Frustration'))) {
                happiness = 0;
            }
            sys.changePokeHappiness(src,team,s,happiness);
            sys.changePokeShine(src, team, s, sys.rand(0,8192) === 0 ? true : false);
            if (pokedb.hasOwnProperty(sys.pokemon(pdata.poke%65536)) && randomgenders) {
                var pokeinfo = pokedb[sys.pokemon(pdata.poke%65536)];
                var gendernum = pokeinfo[6];
                if (gendernum === 3) {
                    gendernum = sys.rand(1,3);
                }
                if ([0,1,2].indexOf(gendernum) == -1) {
                    throw "Invalid Gender";
                }
                sys.changePokeGender(src,team,s,gendernum);
            }
            else {
                sys.changePokeGender(src,team,s,pdata.gender);
            }
            sys.changePokeLevel(src,team,s,pdata.level);
        }
        sys.updatePlayer(src);
        return;
    }
    catch (err) {
        normalbot.sendMessage(src, "Team file was empty or corrupt, could not generate a team. Please report this issue on forums. [Error: "+err+"]");
        throw "Corrupt Team File: "+err;
    }
}

// tfile is a json object

function numPokes(tfile) {
    var tteams = 0;
    for (var t in tfile) {
        if (typeof tfile[t] != "object") {
            continue;
        }
        tteams += 1;
    }
    return tteams;
}

// Valid Packs
function validPacks() {
    var packs = 0;
    for (var x in bfhash) {
        if (bfhash[x].enabled && bfhash[x].active) {
            packs += 1;
        }
    }
    return packs;
}

function isReviewAdmin(src) {
    return (sys.auth(src) >= 2 || SESSION.channels(sys.channelId('BF Review')).isChannelAdmin(src));
}

function isReviewer(src) {
    return (sys.auth(src) >= 1 || SESSION.channels(sys.channelId('BF Review')).isChannelOperator(src));
}

function isTierReviewer(src, tier) {
    if (!reviewers.hasOwnProperty(tier)) {
        return false;
    }
    if (isReviewAdmin(src)) {
        return true;
    }
    var tierrev = reviewers[tier];
    if (isReviewer(src)) {
        for (var x in tierrev) {
            if (sys.name(src).toLowerCase() === tierrev[x].toLowerCase()) {
                return true;
            }
        }
    }
    return false;
}

module.exports = {
    handleCommand: function(source, message, channel) {
        var command;
        var commandData = "";
        var pos = message.indexOf(' ');
        if (pos != -1) {
            command = message.substring(0, pos).toLowerCase();
            commandData = message.substr(pos+1);
        }
        else {
            command = message.substr(0).toLowerCase();
        }
        if (isReviewer(source) || ["bfversion", "submitsets", "viewpacks", "userpokesets", "reviewers"].indexOf(command) > -1) {
            if (['acceptset', 'rejectset', 'deleteset','checkqueue', 'nextset', 'userpokesets'].indexOf(command) > -1 && channel != sys.channelId('BF Review')) {
                normalbot.sendChanMessage(source, "These commands will only work in the #BF Review Channel!");
                return true;
            }
            if (['submitban', 'submitunban', 'submitbans', 'scansets'].indexOf(command) > -1 && sys.auth(source) < 1) {
                normalbot.sendChanMessage(source, "You can't use this command!");
                return true;
            }
            if (['updateteams', 'addpack', 'updatepack', 'deletepack', 'enablepack', 'disablepack', 'addreviewer', 'removereviewer'].indexOf(command) > -1 && !isReviewAdmin(source)) {
                normalbot.sendChanMessage(source, "You can't use this command!");
                return true;
            }
            if (factoryCommand(source, command, commandData, channel) != 'no command') {
                return true;
            }
        }
        return false;
    },
    stepEvent : function() {
        if (parseInt(sys.time())%saveInterval === 0) {
            autoSave("all", "");
            normalbot.sendAll("Autosaved user generated sets.", teamrevchan);
        }
    },
    init: function() {
        try {
            initFactory();
        }
        catch (err) {
            sendChanAll("Error in starting battle factory: "+err, staffchannel);
            working = false;
        }
    },
    afterChannelJoin : function(player, chan) {
        if (chan === sys.channelId('BF Review') && (sys.auth(player) >= 1 || SESSION.channels(sys.channelId('BF Review')).isChannelOperator(player))) {
            sendQueueItem(player, 0)
        }
        if (teamrevchan != sys.channelId("BF Review")) {
            teamrevchan = sys.channelId("BF Review");
        }
    },
    beforeChallengeIssued : function(source, dest, clauses, rated, mode, team, destTier) {
        if (sys.tier(source, team) == "Battle Factory" && destTier == "Battle Factory" && (!working || validPacks() === 0)) {
            sys.sendMessage(source, "Battle Factory is not working, so you can't issue challenges in that tier.");
            return true;
        }
        return false;
    },
    beforeChangeTier: function(src, team, oldtier, newtier) { // This shouldn't be needed, but it's here in case
        if (oldtier == "Battle Factory" && ["Challenge Cup", "CC 1v1", "Wifi CC 1v1", "Battle Factory"].indexOf(newtier) == -1) {
            sys.sendMessage(src, "Please reload your team from the menu to exit Battle Factory. (Your team is now in Challenge Cup.)");
            // clear old teams
            for (var x=0; x<6; x++) {
                sys.changePokeNum(src, team, x, 0);
            }
            sys.changeTier(src, team, "Challenge Cup");
            return true;
        }
        if (newtier == "Battle Factory" && (!working || validPacks() === 0)) {
            sys.sendMessage(src, "Battle Factory is not working, so you can't move into that tier. (Your team is now in Challenge Cup.)");
            sys.changeTier(src, team, "Challenge Cup");
            return true;
        }
        if (newtier == "Battle Factory") {
            generateTeam(src, team, "preset");
        }
    },
    beforeBattleStarted: function(src, dest, srcteam, destteam) {
        if (sys.tier(src, srcteam) == "Battle Factory" && sys.tier(dest, destteam) == "Battle Factory") {
            try {
                var allowedtypes = [];
                for (var x in bfhash) {
                    if (bfhash[x].enabled && bfhash[x].active) {
                        allowedtypes.push(x);
                    }
                }
                if (allowedtypes.length === 0) {
                    throw "ERR404: Couldn't find the team files!";
                }
                var type = allowedtypes.length > 0 ? allowedtypes[sys.rand(0,allowedtypes.length)]: 'preset';
                generateTeam(src, srcteam, type);
                generateTeam(dest, destteam, type);
                dumpData(src, srcteam);
                dumpData(dest, destteam);
            }
            catch (err) {
                working = false;
                sendChanAll("Error in generating teams: "+err, staffchannel);
            }
        }
    },
    onHelp: function(src, topic, channel) {
        var help = [];
        if (topic == "battlefactory") {
            var adminHelp = [
                "/addpack [name] ~ [url]: Downloads a Battle Factory Pack from the internet",
                "/updatepack [name] ~ [url]: Updates a Battle Factory Pack from the internet, loads from the last known URL if no URL is specified",
                "/deletepack [name]: Deletes a Battle Factory Pack",
                "/enablepack [name]: Allows a Battle Factory Pack to be used",
                "/disablepack [name]: Disallows a Battle Factory Pack to be used",
                "/addreviewer [name]:[tier]: Allows a user to review for that tier",
                "/removereviewer [name]:[tier]: Removes review powers for that user in that tier",
                "/updateteams: Update default teams from the web"
            ];
            var reviewHelp = [
                "/pokeslist [pack]: Views the list of installed Pokemon for that pack.",
                "/pokecode [alpha code]: Converts a code to readable format.",
                "/pokesets [poke]:[pack] Gets the sets for that pokemon in a Battle Factory Pack in readable format",
                "/scansets [url/location]: Scan a set file for any critical errors (scans current if no file specified, /scanusersets scans the user sets)",
                "/checkqueue: Checks the current set in the queue",
                "/acceptset: Accepts the current set in the queue",
                "/rejectset: Rejects the current set in the queue",
                "/deleteset [pack]:[code]: Deletes a faulty set.",
                "/nextset: Goes to the next set in the queue",
                "/savesets: Saves user generated Battle Factory sets (use before updating/server downtime)",
                "/refresh: Refreshes a team pack (saves and checks if it's working)",
                "/submit[un]ban: [Un]bans players from submitting sets",
                "/submitbans: Views list of submit bans"
            ];
            var userHelp = [
                "/bfversion: Gives information about the battle factory",
                "/viewpacks: Views installed Battle Factory Packs",
                "/reviewers: Views the list of authorised reviewers",
                "/submitsets: Submits your first team in teambuilder for the battle factory, in the tier that team is currently in (sets are reviewed)"
            ];
            if (sys.auth(src) >= 2 || SESSION.channels(sys.channelId('BF Review')).isChannelAdmin(src)) {
                help = adminHelp.concat(reviewHelp, userHelp);
            }
            else if (sys.auth(src) >= 1 || SESSION.channels(sys.channelId('BF Review')).isChannelOperator(src)) {
                help = reviewHelp.concat(userHelp);
            }
            else {
                help = userHelp;
            }
        }
        if (help.length > 0) {
            sys.sendMessage(src, "*** Battle Factory Operator Commands ***", channel);
            for (var i = 0; i < help.length; ++i) {
                sys.sendMessage(src, help[i], channel);
            }
            return true;
        }
        return false;
    },
    getVersion: function(type) {
        if (type == "script") {
            return bfversion;
        }
        else if (type == "team") {
            if (bfsets.hasOwnProperty('desc')) {
                if (typeof bfsets.desc == "string") {
                    return bfsets.desc;
                }
                else {
                    return "Default";
                }
            }
            else {
                return "Default";
            }
        }
        else {
            return "Invalid Type";
        }
    },
    generateTeam : function(src, team) {
        generateTeam(src, team, 'preset'); // generates a team for players with no pokes
        return true;
    }
}
