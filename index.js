'use strict';

const LIST_CHECK_NICE_RESPONSES = ["Good News! <<NAME>> is on the nice list!", "Great! It looks like <<NAME>> is on the nice list!", "Yay! <<NAME>> made it onto the nice list!"];
const LIST_CHECK_NAUGHTY_RESPONSES = ["Oh dear. It looks like <<NAME>> is on the naughty list.", "Oh man. It looks like <<NAME>> is on the naughty list.", "<<NAME>> is on the naughty list."];
const GENERAL_FALLBACK = [
    "Sorry, what was that?",
    "I didn't quite get that. Just ask to check a name on the Naughty or Nice list. Or help Santa by letting him know if someone has been bad or good.",
    "I'm really sorry, I can't understand. Just ask to check a name on the Naughty or Nice list. Or help Santa by letting him know if someone has been bad or good."
];
const NAMES = [
    "Anna", "Olivia", "Sophia", "Amelia", "Lily", "Emily", "Ava", "Isla", "Aria", "Mia", "Isabella", "Isabelle", "Ella", "Grace", "Evie", "Maya", "Harper", "Sophie", "Layla", "Freya", 
    "Dan", "Oliver", "Noah", "George", "Harry", "Leo", "Charlie", "Jack", "Freddie", "Alfie", "Oscar", "Arthur", "Henry", "Jacob", "Archie", "Joshua", "Theo", "Ethan", "Lucas", "Logan"];
const LISTS = ["bad", "good", "naughty", "nice"];
const OneMonthAgoInMillis = (30 * 24 * 60 * 60 * 1000);

const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion} = require('dialogflow-fulfillment');
const {SimpleResponse, Suggestions} = require('actions-on-google');

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
    const agent = new WebhookClient({request, response});
    const conv = agent.conv();
    let userLastSeen = new Date(0);

    if ('userLastSeen' in conv.user.storage) {
        // retrieve the value of last seen
        userLastSeen = conv.user.storage.userLastSeen;
    }

    // save the user last seen date
    conv.user.storage.userLastSeen = new Date().getTime();

    // show data
    if ('checkData' in conv.user.storage) {
        console.log('Existing Data: ' + JSON.stringify(conv.user.storage.checkData));
    }
    else {
        console.log('No existing data');
    }

    function welcome(agent) {
        let displayText = "Welcome to Santa's Workshop. Just ask to check a name on the Naughty or Nice list. Or help Santa by letting him know if someone has been bad or good.";
        let speech = "<speak><par><media><audio begin='2s' soundLevel='-10dB' src='https://actions.google.com/sounds/v1/cartoon/jingle_bells.ogg' clipEnd='8s' /></media><media><prosody>" + displayText + "</prosody></media></par></speak>";

        console.log('Welcome - User Last Seen: ' + new Date(userLastSeen));

        // reset fallback count
        conv.data.fallbackCount = 0;

        if (userLastSeen !== null) {
            let aMonthAgo = new Date().getTime() - OneMonthAgoInMillis;
            if (new Date(userLastSeen).getTime() > aMonthAgo) {
                displayText = "Welcome back to Santa's Workshop.";
                speech = "<speak><par><media><audio begin='1s' soundLevel='-10dB' src='https://actions.google.com/sounds/v1/cartoon/jingle_bells.ogg' clipEnd='2.5s' /></media><media><prosody>" + displayText + "</prosody></media></par></speak>";
            }
        }

        conv.add(new SimpleResponse({
            speech: speech,
            text: displayText
        }));

        // suggestions
        if (conv.surface.capabilities.has("actions.capability.SCREEN_OUTPUT"))
        {
            conv.ask(new Suggestions("Has " + getRandomName() + " been " + getRandomList()));
            conv.ask(new Suggestions(getRandomName() + " has been " + getRandomList()));
        }

        agent.add(conv);
    }

    function fallback(agent) {
        console.log('Fallback - Count is ' + conv.data.fallbackCount);

        if (conv.data.fallbackCount >= GENERAL_FALLBACK.length) {
            conv.close("Sorry, I still don't understand. Let stop here and try again later");
        } else {
            conv.ask(GENERAL_FALLBACK[conv.data.fallbackCount]);

            // suggestions
            if (conv.surface.capabilities.has("actions.capability.SCREEN_OUTPUT"))
            {
                conv.ask(new Suggestions("Has " + getRandomName() + " been " + getRandomList()));
                conv.ask(new Suggestions(getRandomName() + " has been " + getRandomList()));
            }
        }

        // increment fallback count
        conv.data.fallbackCount++;

        agent.add(conv);
    }

    function checkList(agent) {
        let nameToCheck = agent.parameters.name;
        let santaName = agent.parameters.santaName;
        let listType = agent.parameters.listType;
        let actualList = 'nice';
        let responseText = "";

        console.log("Check if " + nameToCheck + " is on " + santaName + "'s " + listType + " list");

        //reset fallback count
        conv.data.fallbackCount = 0;

        //fetch the existing data...
        actualList = getList(nameToCheck);

        if (actualList === 'nice') {
            responseText = LIST_CHECK_NICE_RESPONSES[Math.floor(Math.random() * LIST_CHECK_NICE_RESPONSES.length)].replace('<<NAME>>', nameToCheck);
        }
        else {
            responseText = LIST_CHECK_NAUGHTY_RESPONSES[Math.floor(Math.random() * LIST_CHECK_NAUGHTY_RESPONSES.length)].replace('<<NAME>>', nameToCheck);
        }
        responseText = responseText + " Is there another name you'd like me to check?";
        console.log(responseText);

        conv.ask(responseText);

        // suggestions
        if (conv.surface.capabilities.has("actions.capability.SCREEN_OUTPUT"))
        {
            conv.ask(new Suggestions("Has " + getRandomName() + " been " + getRandomList()));
            conv.ask(new Suggestions(getRandomName() + " has been " + getRandomList()));
        }

        agent.add(conv);
    }

    function updateList(agent) {
	let name = agent.parameters.name;
	let santaName = agent.parameters.santaName;
	let listType = agent.parameters.listType;

	console.log("Update " + name + " on " + santaName + "'s " + listType + " list");

	//reset fallback count
	conv.data.fallbackCount = 0;

	// existing list
	let existingList = getList(name);

	// add or update
	saveName(name, listType);

	// create response
	let responseToUser = {};
	if (listType === 'nice') {
	    if (existingList === listType) {
	        responseToUser.displayText = "That's OK. " + name + " is already on the Nice list.";
	        responseToUser.speech = "<speak><par><media><audio begin='0.6s' soundLevel='+20dB' src='https://actions.google.com/sounds/v1/foley/pen_writing.ogg' clipEnd='4s' /></media><media><prosody>That's OK. <break time='700ms' /> " + name + " is already on the Nice list.</prosody></media></par></speak>";
	    }
	    else {
	        responseToUser.displayText = "Great! I've let " + santaName + " know that " + name + " has been good.";
	        responseToUser.speech = "<speak><par><media><audio begin='0.6s' soundLevel='+20dB' src='https://actions.google.com/sounds/v1/foley/pen_writing.ogg' clipEnd='4s' /></media><media><prosody>Great! <break time='700ms' /> I'll update the list.</prosody></media></par></speak>";
	    }
	}
	else {
	    if (existingList === listType) {
	        responseToUser.displayText = "Oh.  Looks like " + santaName + " already has " + name + " on the Naughty list.";
	        responseToUser.speech = "<speak><par><media><audio begin='0.6s' soundLevel='+20dB' src='https://actions.google.com/sounds/v1/foley/pen_writing.ogg' clipEnd='4s' /></media><media><prosody>Oh. <break time='700ms' />  Looks like " + santaName + " already has " + name + " on the Naughty list.</prosody></media></par></speak>";
	    }
	    else {
	        responseToUser.displayText = "Oh dear. OK I'll let " + santaName + " know.";
	        responseToUser.speech = "<speak><par><media><audio begin='0.6s' soundLevel='+20dB' src='https://actions.google.com/sounds/v1/foley/pen_writing.ogg' clipEnd='4s' /></media><media><prosody>Oh Dear! <break time='700ms' />OK I'll let " + santaName + " know.</prosody></media></par></speak>";
	    }
	}

	console.log(responseToUser.displayText);

	conv.close(new SimpleResponse({
	    speech: responseToUser.speech,
	    text: responseToUser.displayText
	}));
	agent.add(conv);
    }

    function saveName(name, list) {

        let checkData = {};

        // does the data already exist?
        if ('checkData' in conv.user.storage) {
            checkData = JSON.parse(conv.user.storage.checkData);
        }

        // add/update name to exist?
        checkData[name] = {list: list};

        // save
        console.log('Saving: ' + JSON.stringify(checkData));
        conv.user.storage.checkData = JSON.stringify(checkData);
    }

    function getList(name) {

        let checkData = {};

        // does the data already exist?
        if ('checkData' in conv.user.storage) {
            checkData = JSON.parse(conv.user.storage.checkData);

            if (name in checkData && checkData[name] !== null && checkData[name].list !== null) {
                return checkData[name].list;
            }
        }
        else {
            saveName(name, 'nice');
        }

        return 'nice';
    }

    function getRandomName() {
        return NAMES[Math.floor(Math.random() * NAMES.length)];
    }

    function getRandomList() {
        return LISTS[Math.floor(Math.random() * LISTS.length)];
    }

    // Run the proper function handler based on the matched Dialogflow intent name
    let intentMap = new Map();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    intentMap.set('No Input', fallback);

    intentMap.set('Check the List', checkList);
    intentMap.set('Check the List - first person', checkList);
    intentMap.set('List Check (Follow Up)', checkList);
    intentMap.set('Check the List - Follow Up', checkList);
    intentMap.set('Check the List - yes check another name', checkList);
    intentMap.set('Check the List - no more names to check', checkList);

    intentMap.set('Update the List', updateList);
    intentMap.set('Update the List (Follow Up) Specifing the List', updateList);
    intentMap.set('Update the List (Follow up) Specifying the List', updateList);
    intentMap.set('Update the List (Follow Up) Specifing a new Name', updateList);
    intentMap.set('Update the List (Follow up) Specifying a new Name', updateList);

    console.log('Intent: ' + agent.intent);

    agent.handleRequest(intentMap);
});
