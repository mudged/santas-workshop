'use strict';

const OneMonthAgoInMillis = (30 * 24 * 60 * 60 * 1000);
const GENERAL_FALLBACK = [
    "Sorry, what was that?",
    "I didn't quite get that. Just ask to check a name on the Naughty or Nice list. Or help Santa by letting him know if someone has been bad or good.",
    "I'm really sorry, I can't understand. Just ask to check a name on the Naughty or Nice list. Or help Santa by letting him know if someone has been bad or good."
  ];

const LIST_CHECK_NICE_RESPONSES = ["Good News! <<NAME>> is on the nice list!", "Great! It looks like <<NAME>> is on the nice list!", "Yay! <<NAME>> made it onto the nice list!"];
const LIST_CHECK_NAUGHTY_RESPONSES = ["Oh dear. It looks like <<NAME>> is on the naughty list.", "Oh man. It looks like <<NAME>> is on the naughty list.", "<<NAME>> is on the naughty list."];

const functions = require('firebase-functions'); // Cloud Functions for Firebase library
const DialogflowApp = require('actions-on-google').DialogflowApp; // Google Assistant helper library

const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

const db = admin.database();

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));
  if (request.body.result) 
  {
    processV1Request(request, response);
  } 
  else if (request.body.queryResult) 
  {
    processV2Request(request, response);
  } 
  else 
  {
    console.log('Invalid Request');
    return response.status(400).end('Invalid Webhook Request (expecting v1 or v2 webhook request)');
  }
});
/*
* Function to handle v1 webhook requests from Dialogflow
*/
function processV1Request (request, response) 
{
    let action = request.body.result.action; // https://dialogflow.com/docs/actions-and-parameters
    let parameters = request.body.result.parameters; // https://dialogflow.com/docs/actions-and-parameters
    let inputContexts = request.body.result.contexts; // https://dialogflow.com/docs/contexts
    let requestSource = (request.body.originalRequest) ? request.body.originalRequest.source : undefined;
    const googleAssistantRequest = 'google'; // Constant to identify Google Assistant requests
    const app = new DialogflowApp({request: request, response: response});
    const userId = request.body.originalRequest.data.user.userId;
    const nameToCheck = parameters.name;
    const listType = parameters.listType;
    const santaName = parameters.santaName;
  
    console.log("UserId: " + userId + ", Name: " + nameToCheck + ", List: " + listType);
  
    // Create handlers for Dialogflow actions as well as a 'default' handler
    const actionHandlers = {
        // The default welcome intent has been matched, welcome the user (https://dialogflow.com/docs/events#default_welcome_intent)
        'input.welcome': () => {
            app.data.fallbackCount = 0;
            welcome(app.getLastSeen());
        },
        // The default fallback intent has been matched, try to recover (https://dialogflow.com/docs/intents#fallback_intents)
        'input.unknown': () => {
            handleFallback(app, promptFetch);
        },
        'input.list-check': () => {
            app.data.fallbackCount = 0;
            checkList(userId, nameToCheck, listType.toLowerCase(), santaName);
        },
        'input.list-update': () => {
            app.data.fallbackCount = 0;
            updateList(userId, nameToCheck, listType.toLowerCase(), santaName);  
        },
        
        'default': () => {
            handleFallback(app, promptFetch);
        }
  };
  
  // If undefined or unknown action use the default handler
  if (!actionHandlers[action]) 
  {
        action = 'default';
  }
  
  // Run the proper handler function to handle the request from Dialogflow
  actionHandlers[action]();

  //check the list
  function checkList(userId, nameToCheck, listType, santaName)
  {
      console.log("Check if " + nameToCheck + " is on " + santaName + "'s " + listType + " list");
      
      //fetch the existing data...
      db.ref('santasList/'+userId).once('value', snapshot =>
      {
          let actualList = 'nice';

          //...and if it exists...
          if (snapshot != null && snapshot.val() != null)
          {
              let userNames = snapshot.val();
              
              //...and the name exists...
              let person = userNames[nameToCheck];
              if (person != null)
              {
                  //...find the list
                  console.log('Found name ' + nameToCheck + ' on the ' + person.list + ' list');
                  actualList = person.list;
              }
          }

          let responseText = "";
          if (actualList === 'nice')
          {
              responseText = LIST_CHECK_NICE_RESPONSES[Math.floor(Math.random() * LIST_CHECK_NICE_RESPONSES.length)].replace('<<NAME>>',nameToCheck);
          }
          else
          {
              responseText = LIST_CHECK_NAUGHTY_RESPONSES[Math.floor(Math.random() * LIST_CHECK_NAUGHTY_RESPONSES.length)].replace('<<NAME>>',nameToCheck);
          } 
          sendResponse(responseText + " Is there another name you'd like me to check?");
      });
  }

  function welcome(lastSeen)
  {
      let responseToUser = {};
      responseToUser.displayText = "Welcome to Santa's Workshop. Just ask to check a name on the Naughty or Nice list. Or help Santa by letting him know if someone has been bad or good.";
      responseToUser.speech = "<speak><par><media><audio begin='2s' soundLevel='-10dB' src='https://actions.google.com/sounds/v1/cartoon/jingle_bells.ogg' clipEnd='8s' /></media><media><prosody>" + responseToUser.displayText +"</prosody></media></par></speak>";      

      if (lastSeen != null)
      {
          console.log("lastSeen is ..." + lastSeen);

          let aMonthAgo = new Date().getTime() - OneMonthAgoInMillis;
          if (lastSeen.getTime() > aMonthAgo)
          {
              responseToUser.displayText = "Welcome back to Santa's Workshop.";
              responseToUser.speech = "<speak><par><media><audio begin='1s' soundLevel='-10dB' src='https://actions.google.com/sounds/v1/cartoon/jingle_bells.ogg' clipEnd='2.5s' /></media><media><prosody>" + responseToUser.displayText +"</prosody></media></par></speak>";      
          }
      }

      sendResponse(responseToUser);
  }

  function handleFallback(app, promptFetch) 
  {
      app.data.fallbackCount = parseInt(app.data.fallbackCount, 10);
      app.data.fallbackCount++;
      if (app.data.fallbackCount > 3) 
      {
          app.tell(promptFetch.getFinalFallbackPrompt());
      } 
      else 
      {
          app.ask(GENERAL_FALLBACK[app.data.fallbackCount], getGeneralNoInputPrompts());
      }
  }

  function updateList(userId, name, listType, santaName)
  {
      console.log("Update " + nameToCheck + " on " + santaName + "'s " + listType + " list");
    
      //fetch the existing data...
      db.ref('santasList/'+userId).once('value', snapshot =>
      {
          let existingData = {};
          var existingList = null;

          //...and if it exists...
          if (snapshot != null && snapshot.val() != null)
          {
              //...use it as the data
              existingData = snapshot.val();
              if (existingData != null && existingData[name] != null)
              {
                  existingList = existingData[name].list;
                  console.log("Found existing list entry for "+ name + " of " + existingList);
              }
          }

          //update the database
          existingData[name] = {list: listType};
          db.ref('santasList/'+userId).set(existingData);

          console.log("Existing list entry for "+ name + " is " + existingList);

          let responseToUser = {};      
          if (listType === 'nice')
          {
              if (existingList === listType)
              {
                  responseToUser.displayText = "That's OK. " + name + " is already on the Nice list.";
                  responseToUser.speech = "<speak><par><media><audio begin='0.6s' soundLevel='+20dB' src='https://actions.google.com/sounds/v1/foley/pen_writing.ogg' clipEnd='4s' /></media><media><prosody>That's OK. <break time='700ms' /> " + name + " is already on the Nice list.</prosody></media></par></speak>";
              }
              else
              {
                  responseToUser.displayText = "Great! I've let " + santaName + " know that " + name + " has been good.";
                  responseToUser.speech = "<speak><par><media><audio begin='0.6s' soundLevel='+20dB' src='https://actions.google.com/sounds/v1/foley/pen_writing.ogg' clipEnd='4s' /></media><media><prosody>Great! <break time='700ms' /> I'll update the list.</prosody></media></par></speak>";
              }
          }
          else
          {
              if (existingList === listType)
              {
                  responseToUser.displayText = "Oh.  Looks like " + santaName + " already has " + name + " on the Naughty list.";
                  responseToUser.speech = "<speak><par><media><audio begin='0.6s' soundLevel='+20dB' src='https://actions.google.com/sounds/v1/foley/pen_writing.ogg' clipEnd='4s' /></media><media><prosody>Oh. <break time='700ms' />  Looks like " + santaName + " already has " + name + " on the Naughty list.</prosody></media></par></speak>";
              }
              else
              {    
                  responseToUser.displayText = "Oh dear. OK I'll let " + santaName + " know.";
                  responseToUser.speech = "<speak><par><media><audio begin='0.6s' soundLevel='+20dB' src='https://actions.google.com/sounds/v1/foley/pen_writing.ogg' clipEnd='4s' /></media><media><prosody>Oh Dear! <break time='700ms' />OK I'll let " + santaName + " know.</prosody></media></par></speak>";
              }
          }

          sendResponse(responseToUser);
      });

      
  }
  
  // Function to send correctly formatted Google Assistant responses to Dialogflow which are then sent to the user
  function sendGoogleResponse (responseToUser) 
  {
    if (typeof responseToUser === 'string') 
    {
      app.ask(responseToUser); // Google Assistant response
    } 
    else 
    {
      // If speech or displayText is defined use it to respond
      let googleResponse = app.buildRichResponse().addSimpleResponse({
        speech: responseToUser.speech || responseToUser.displayText,
        displayText: responseToUser.displayText || responseToUser.speech
      });
      
      // Optional: Overwrite previous response with rich response
      if (responseToUser.googleRichResponse) 
      {
        googleResponse = responseToUser.googleRichResponse;
      }
      
      // Optional: add contexts (https://dialogflow.com/docs/contexts)
      if (responseToUser.googleOutputContexts) 
      {
        app.setContext(...responseToUser.googleOutputContexts);
      }
      console.log('Response to Dialogflow (AoG): ' + JSON.stringify(googleResponse));
      app.ask(googleResponse); // Send response to Dialogflow and Google Assistant
    }
  }
  
  // Function to send correctly formatted responses to Dialogflow which are then sent to the user
  function sendResponse (responseToUser) {
    // if the response is a string send it as a response to the user
    if (typeof responseToUser === 'string') 
    {
      let responseJson = {};
      responseJson.speech = responseToUser; // spoken response
      responseJson.displayText = responseToUser; // displayed response
      response.json(responseJson); // Send response to Dialogflow
    } 
    else 
    {
      // If the response to the user includes rich responses or contexts send them to Dialogflow
      let responseJson = {};
      // If speech or displayText is defined, use it to respond (if one isn't defined use the other's value)
      responseJson.speech = responseToUser.speech || responseToUser.displayText;
      responseJson.displayText = responseToUser.displayText || responseToUser.speech;
      // Optional: add rich messages for integrations (https://dialogflow.com/docs/rich-messages)
      responseJson.data = responseToUser.data;
      // Optional: add contexts (https://dialogflow.com/docs/contexts)
      responseJson.contextOut = responseToUser.outputContexts;
      console.log('Response to Dialogflow: ' + JSON.stringify(responseJson));
      response.json(responseJson); // Send response to Dialogflow
    }
  }
}

// Construct rich response for Google Assistant (v1 requests only)
const app = new DialogflowApp();
const googleRichResponse = app.buildRichResponse()
  .addSimpleResponse('This is the first simple response for Google Assistant')
  .addSuggestions(
    ['Suggestion Chip', 'Another Suggestion Chip'])
    // Create a basic card and add it to the rich response
  .addBasicCard(app.buildBasicCard(`This is a basic card.  Text in a
 basic card can include "quotes" and most other unicode characters
 including emoji 📱.  Basic cards also support some markdown
 formatting like *emphasis* or _italics_, **strong** or __bold__,
 and ***bold itallic*** or ___strong emphasis___ as well as other things
 like line  \nbreaks`) // Note the two spaces before '\n' required for a
                        // line break to be rendered in the card
    .setSubtitle('This is a subtitle')
    .setTitle('Title: this is a title')
    .addButton('This is a button', 'https://assistant.google.com/')
    .setImage('https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
      'Image alternate text'))
  .addSimpleResponse({ speech: 'This is another simple response',
    displayText: 'This is the another simple response 💁' });
// Rich responses for Slack and Facebook for v1 webhook requests
const richResponsesV1 = {
  'slack': {
    'text': 'This is a text response for Slack.',
    'attachments': [
      {
        'title': 'Title: this is a title',
        'title_link': 'https://assistant.google.com/',
        'text': 'This is an attachment.  Text in attachments can include \'quotes\' and most other unicode characters including emoji 📱.  Attachments also upport line\nbreaks.',
        'image_url': 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
        'fallback': 'This is a fallback.'
      }
    ]
  },
  'facebook': {
    'attachment': {
      'type': 'template',
      'payload': {
        'template_type': 'generic',
        'elements': [
          {
            'title': 'Title: this is a title',
            'image_url': 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
            'subtitle': 'This is a subtitle',
            'default_action': {
              'type': 'web_url',
              'url': 'https://assistant.google.com/'
            },
            'buttons': [
              {
                'type': 'web_url',
                'url': 'https://assistant.google.com/',
                'title': 'This is a button'
              }
            ]
          }
        ]
      }
    }
  }
};

/*
* Function to handle v2 webhook requests from Dialogflow
*/
function processV2Request (request, response) {
  // An action is a string used to identify what needs to be done in fulfillment
  let action = (request.body.queryResult.action) ? request.body.queryResult.action : 'default';
  // Parameters are any entites that Dialogflow has extracted from the request.
  let parameters = request.body.queryResult.parameters || {}; // https://dialogflow.com/docs/actions-and-parameters
  // Contexts are objects used to track and store conversation state
  let inputContexts = request.body.queryResult.contexts; // https://dialogflow.com/docs/contexts
  // Get the request source (Google Assistant, Slack, API, etc)
  let requestSource = (request.body.originalDetectIntentRequest) ? request.body.originalDetectIntentRequest.source : undefined;
  // Get the session ID to differentiate calls from different users
  let session = (request.body.session) ? request.body.session : undefined;
  
  const userId = request.body.originalRequest.data.user.userId;
  const nameToCheck = parameters.name;
  const listType = parameters.listType;
  const santaName = parameters.santaName;
  
  // Create handlers for Dialogflow actions as well as a 'default' handler
  const actionHandlers = {

    // The default welcome intent has been matched, welcome the user (https://dialogflow.com/docs/events#default_welcome_intent)
    'input.welcome': () => {
        app.data.fallbackCount = 0;
        welcome(app.getLastSeen());
    },

    // The default fallback intent has been matched, try to recover (https://dialogflow.com/docs/intents#fallback_intents)
    'input.unknown': () => {
        handleFallback(app, promptFetch);
    },  
    
    'input.list-check': () => {
        app.data.fallbackCount = 0;
        checkList(userId, nameToCheck, listType.toLowerCase(), santaName);
    },
    
    'input.list-update': () => {
        app.data.fallbackCount = 0;
        updateList(userId, nameToCheck, listType.toLowerCase(), santaName);  
    },

    // Default handler for unknown or undefined actions
    'default': () => {
        handleFallback(app, promptFetch);
    }
  };

  // If undefined or unknown action use the default handler
  if (!actionHandlers[action]) 
  {
    action = 'default';
  }

  // Run the proper handler function to handle the request from Dialogflow
  actionHandlers[action]();

  // Function to send correctly formatted responses to Dialogflow which are then sent to the user
  function sendResponse (responseToUser) 
  {
    // if the response is a string send it as a response to the user
    if (typeof responseToUser === 'string') 
    {
      let responseJson = {fulfillmentText: responseToUser}; // displayed response
      response.json(responseJson); // Send response to Dialogflow
    } 
    else 
    {
      // If the response to the user includes rich responses or contexts send them to Dialogflow
      let responseJson = {};
      // Define the text response
      responseJson.fulfillmentText = responseToUser.fulfillmentText;
      // Optional: add rich messages for integrations (https://dialogflow.com/docs/rich-messages)
      if (responseToUser.fulfillmentMessages) 
      {
        responseJson.fulfillmentMessages = responseToUser.fulfillmentMessages;
      }
      // Optional: add contexts (https://dialogflow.com/docs/contexts)
      if (responseToUser.outputContexts) 
      {
        responseJson.outputContexts = responseToUser.outputContexts;
      }
      // Send the response to Dialogflow
      console.log('Response to Dialogflow: ' + JSON.stringify(responseJson));
      response.json(responseJson);
    }
  }
}

const richResponseV2Card = {
  'title': 'Title: this is a title',
  'subtitle': 'This is an subtitle.  Text can include unicode characters including emoji 📱.',
  'imageUri': 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
  'buttons': [
    {
      'text': 'This is a button',
      'postback': 'https://assistant.google.com/'
    }
  ]
};
const richResponsesV2 = [
  {
    'platform': 'ACTIONS_ON_GOOGLE',
    'simple_responses': {
      'simple_responses': [
        {
          'text_to_speech': 'Spoken simple response',
          'display_text': 'Displayed simple response'
        }
      ]
    }
  },
  {
    'platform': 'ACTIONS_ON_GOOGLE',
    'basic_card': {
      'title': 'Title: this is a title',
      'subtitle': 'This is an subtitle.',
      'formatted_text': 'Body text can include unicode characters including emoji 📱.',
      'image': {
        'image_uri': 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png'
      },
      'buttons': [
        {
          'title': 'This is a button',
          'open_uri_action': {
            'uri': 'https://assistant.google.com/'
          }
        }
      ]
    }
  },
  {
    'platform': 'FACEBOOK',
    'card': richResponseV2Card
  },
  {
    'platform': 'SLACK',
    'card': richResponseV2Card
  }
];

