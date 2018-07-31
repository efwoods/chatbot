/**
 * Copyright 2017 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

'use strict';

require('dotenv').config({
  silent: true
});

const express = require('express'); // app server
const bodyParser = require('body-parser'); // parser for post requests
const numeral = require('numeral');
const fs = require('fs'); // file system for loading JSON

const AssistantV1 = require('watson-developer-cloud/assistant/v1');
const DiscoveryV1 = require('watson-developer-cloud/discovery/v1');
const NaturalLanguageUnderstandingV1 = require('watson-developer-cloud/natural-language-understanding/v1.js');
const ToneAnalyzerV3 = require('watson-developer-cloud/tone-analyzer/v3');

const assistant = new AssistantV1({ version: '2018-02-16' });
const discovery = new DiscoveryV1({ version: '2018-03-05' });
const nlu = new NaturalLanguageUnderstandingV1({ version: '2018-03-16' });

const WatsonDiscoverySetup = require('./lib/watson-discovery-setup');
const WatsonAssistantSetup = require('./lib/watson-assistant-setup');

const DEFAULT_NAME = 'watson-quantum-chatbot';
const DISCOVERY_ACTION = 'rnr'; // Replaced RnR w/ Discovery but Assistant action is still 'rnr'.
const DISCOVERY_DOCS = [
  './data/discovery/docs/qc-textbook-chapter1.docx'
];

const CREATE_INTENTS  = 'create_intents';
const CREATE_ENTITIES = 'create_entities';
const LIST_INTENTS = 'list_intents';
const LIST_ENTITIES = 'list_entities';

const app = express();

// Bootstrap application settings
app.use(express.static('./public')); // load UI from public folder
app.use(bodyParser.json());

// setupError will be set to an error message if we cannot recover from service setup or init error.
let setupError = '';

let discoveryParams; // discoveryParams will be set after Discovery is validated and setup.
const discoverySetup = new WatsonDiscoverySetup(discovery);
const discoverySetupParams = { default_name: DEFAULT_NAME, documents: DISCOVERY_DOCS };
discoverySetup.setupDiscovery(discoverySetupParams, (err, data) => {
  if (err) {
    handleSetupError(err);
  } else {
    console.log('Discovery is ready!');
    discoveryParams = data;
  }
});

let workspaceID; // workspaceID will be set when the workspace is created or validated.
const assistantSetup = new WatsonAssistantSetup(assistant);
const workspaceJson = JSON.parse(fs.readFileSync('data/conversation/workspaces/quantum.json'));
const assistantSetupParams = { default_name: DEFAULT_NAME, workspace_json: workspaceJson };
assistantSetup.setupAssistantWorkspace(assistantSetupParams, (err, data) => {
  if (err) {
    handleSetupError(err);
  } else {
    console.log('Watson Assistant is ready!');
    workspaceID = data;
  }
});

// Endpoint to be called from the client side
app.post('/api/message', function(req, res) {
  if (setupError) {
    return res.json({ output: { text: 'The app failed to initialize properly. Setup and restart needed.' + setupError } });
  }

  if (!workspaceID) {
    return res.json({
      output: {
        text: 'Assistant initialization in progress. Please try again.'
      }
    });
  }
  console.log('app.post called.....');

  const payload = {
    workspace_id: workspaceID,
    input: {}
  };

  // common regex patterns
  const regpan = /^([a-zA-Z]){5}([0-9]){4}([a-zA-Z]){1}?$/;
  // const regadhaar = /^\d{12}$/;
  // const regmobile = /^(?:(?:\+|0{0,2})91(\s*[\-]\s*)?|[0]?)?[789]\d{9}$/;
  if (req.body) {
    if (req.body.input) {
      let inputstring = req.body.input.text;
      console.log('input string ', inputstring);
      const words = inputstring.split(' ');
      console.log('words ', words);
      inputstring = '';
      for (let i = 0; i < words.length; i++) {
        if (regpan.test(words[i]) === true) {
          // const value = words[i];
          words[i] = '1111111111';
        }
        inputstring += words[i] + ' ';
      }
      // words.join(' ');
      inputstring = inputstring.trim();
      console.log('After inputstring ', inputstring);
      // payload.input = req.body.input;
      payload.input.text = inputstring;
    }
    if (req.body.context) {
      // The client must maintain context/state
      payload.context = req.body.context;
    }
  }
  callAssistant(payload);
  /**
   * Send the input to the Assistant service.
   * @param payload
   */
  function callAssistant(payload) {
    console.log('callAssistant called.....');
    const queryInput = JSON.stringify(payload.input);
    console.log('assistant.input :: ', JSON.stringify(payload.input));
    // const context_input = JSON.stringify(payload.context);
  //return;
    assistant.message(payload, function(err, data) {
      if (err) {
        return res.status(err.code || 500).json(err);
      } else {
        console.log('assistant.message :: ', JSON.stringify(data));
        // lookup actions
        checkForLookupRequests(data, function(err, data) {
          if (err) {
            return res.status(err.code || 500).json(err);
          } else {
            return res.json(data);
          }
        });
      }
    });
  }
});

/**
 * Looks for actions requested by Assistant service and provides the requested data.
 */
function checkForLookupRequests(data, callback) {
  console.log('checkForLookupRequests');

  if (data.context && data.context.action && data.context.action.lookup && data.context.action.lookup != 'complete') {
    const payload = {
      workspace_id: workspaceID,
      context: data.context,
      input: data.input
    };
    
   if (data.context.action.lookup === LIST_INTENTS) { // <<<<<<< work in progress
      console.log('************** List Intents *************** InputText : ' + payload.input.text + ' ' + data.context.action.lookup);
      console.log(data);
      assistant.listIntents(payload, function(err, intent_data) {
              console.log(data);
              console.log(intent_data);
              if (err) {
              console.error(err);
              } else {
    //                      console.log(JSON.stringify(data, null, 2));
                      
                      //          discoveryResponse = bestPassage.passage_text; 
    //                      if (data.output) {
                              let i;
                              for(i =0; i < intent_data.intents.length; i++){
                                      data.output.text.push(JSON.stringify(intent_data.intents[i].intent));
                                      data.output.text.push(JSON.stringify(intent_data.intents[i].description));
                      console.log(data);
                              }
              }
                      // Clear the context's action since the lookup and append was completed.
                  data.context.action = {};
                      callback(null, data);
              // Clear the context's action since the lookup was completed.
                      payload.context.action = {};
                      
      });
    } else if (data.context.action.lookup === LIST_ENTITIES) {
      console.log('************** List Intents *************** InputText : ' + payload.input.text + ' ' + data.context.action.lookup);
      console.log(data);
      assistant.listEntities(payload, function(err, entity_data) {
              console.log(data);
              console.log(entity_data);
              if (err) {
              console.error(err);
              } else {
  //                      console.log(JSON.stringify(data, null, 2));
                      
                      //          discoveryResponse = bestPassage.passage_text; 
  //                      if (data.output) {
                              let i;
                              for(i =0; i < entity_data.entities.length; i++){
                                      data.output.text.push(JSON.stringify(entity_data.entities[i].intent));
                                      data.output.text.push(JSON.stringify(entity_data.entities[i].description));
                      console.log(data);
                              }
              }
                      // Clear the context's action since the lookup and append was completed.
                  data.context.action = {};
                      callback(null, data);
              // Clear the context's action since the lookup was completed.
                      payload.context.action = {};
                      
      });
    } else if (data.context.action.lookup === CREATE_INTENTS) {
      console.log('hello')
      console.log('************** Create Entity *************** InputText : ' + payload.input.text + ' ' + data.context.action.lookup);
      console.log(data);
      var params = {
              workspace_id: workspaceID,
              entity: payload.input.text,
              values: [
              {
              value: payload.input.text
              }
              ]
      };
      assistant.createEntity(params, function(err, response) {
        if (err) {
              console.error(err);
        } else {
              console.log(JSON.stringify(response,null, 2));
        }
      });
    } else if (data.context.action.lookup === CREATE_ENTITIES) {
      console.log('hello')
      console.log('************** Create Entity *************** InputText : ' + payload.input.text + ' ' + data.context.action.lookup);
      console.log(data);
      var params = {
              workspace_id: workspaceID,
              entity: payload.input.text,
              values: [
              {
              value: payload.input.text
              }
              ]
      };
      conversation.createEntity(params, function(err, response) {
        if (err) {
              console.error(err);
        } else {
              console.log(JSON.stringify(response,null, 2));
        }
      });
} else if (data.context.action.lookup === DISCOVERY_ACTION) {
      console.log('************** Discovery *************** InputText : ' + payload.input.text + ' ' + data.context.action.lookup); // + data.context.action.lookup < ------------- new
      let discoveryResponse = '';
      if (!discoveryParams) {
        console.log('Discovery is not ready for query.');
        discoveryResponse = 'Sorry, currently I do not have a response. Discovery initialization is in progress. Please try again later.';
        if (data.output.text) {
          data.output.text.push(discoveryResponse);
        }
        // Clear the context's action since the lookup and append was attempted.
        data.context.action = {};
        callback(null, data);
        // Clear the context's action since the lookup was attempted.
        payload.context.action = {};
      } else {
        const queryParams = {
          natural_language_query: payload.input.text,
          passages: true
        };
        Object.assign(queryParams, discoveryParams);
        discovery.query(queryParams, (err, searchResponse) => {
          discoveryResponse = 'Sorry, currently I do not have a response. Our Customer representative will get in touch with you shortly.';
          if (err) {
            console.error('Error searching for documents: ' + err);
          } else if (searchResponse.passages.length > 0) {
            const bestPassage = searchResponse.passages[0]; // THIS WILL GRAB THE ZEROETH PASSAGE
            console.log('Passage score: ', bestPassage.passage_score);
            console.log('Passage text: ', bestPassage.passage_text);

            // Trim the passage to try to get just the answer part of it.
            const lines = bestPassage.passage_text.split('\n');
            let bestLine;
            let questionFound = false;
            for (let i = 0, size = lines.length; i < size; i++) {
              const line = lines[i].trim();
              if (!line) {
                continue; // skip empty/blank lines
              }
              if (line.includes('?') || line.includes('<h1')) {
                // To get the answer we needed to know the Q/A format of the doc.
                // Skip questions which either have a '?' or are a header '<h1'...
                questionFound = true;
                continue;
              }
              bestLine = line; // Best so far, but can be tail of earlier answer.
              if (questionFound && bestLine) {                                                                                  // THIS MEANS THE CODE IS SEARCHING FOR A SINGLE ANSWER AFTER A QUESTION. THE DOCUMENTS NEED TO BE IN Q&A FORMAT
                // We found the first non-blank answer after the end of a question. Use it.
                break;
              }
            }
            discoveryResponse =
              bestLine || 'Sorry I currently do not have an appropriate response for your query. Our customer care executive will call you in 24 hours.';

          }

          //     discoveryResponse = bestPassage.passage_text; 
          //console.log('before the push');
          //console.log(JSON.stringify(data, null, 2));
          if (data.output.text) {
            data.output.text.push(discoveryResponse);    // <<<< THIS SHOWS THE DISCOVERY RESPONSE ON THE FRONT END
            console.log(JSON.stringify(data, null, 2));
          }
            // Clear the context's action since the lookup and append was completed.
          data.context.action = {};
          callback(null, data);
          // Clear the context's action since the lookup was completed.
          payload.context.action = {};
        });
      }            
    } else {
        callback(null, data);
        return;
    }
  } else {
    callback(null, data);
    return;
  }
}

/**
 * Handle setup errors by logging and appending to the global error text.
 * @param {String} reason - The error message for the setup error.
 */
function handleSetupError(reason) {
  setupError += ' ' + reason;
  console.error('The app failed to initialize properly. Setup and restart needed.' + setupError);
  // We could allow our chatbot to run. It would just report the above error.
  // Or we can add the following 2 lines to abort on a setup error allowing Bluemix to restart it.
  console.error('\nAborting due to setup error!');
  process.exit(1);
}

module.exports = app;
