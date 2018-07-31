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

const VERIFY_TOPIC_NAME = 'verify_topic_name';
const UPDATE_DIALOGUE = 'update_dialogue';
const LIST_TOPICS = 'list_topics';

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
  
  if (payload.input.text != '') {
          // console.log('input text payload = ', payload.input.text);

    	//console.log('PAYLOAD_CONTEXT =', payload.context.nlu_output);
		assistant.message(payload, function(err, data) {
		  if (err) {
		    return res.status(err.code || 500).json(err);
		  } else {
		  	if(data.context.inputQuery === null){	
			  	console.log(payload.context.nlu_output);
		   //   	console.log('HERE',payload.context.nlu_output.keywords[0].text);
			  	if(payload.context.nlu_output !== undefined) {
			  		data.context.keywords = payload.context.nlu_output.keywords;
			  		console.log('DATA KEYWORDS', data.context.keywords);
			  	}
			}
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
    
   if (data.context.action.lookup === LIST_TOPICS) {
      console.log('************** List Entities:Values *************** InputText : ' + payload.input.text + ' ' + data.context.action.lookup);
      console.log(data);
      var topics = {
      	workspace_id: workspaceID,
      	entity: 'topics'
      };
      assistant.listValues(topics, function(err, entity_data) {
              console.log(data);
              console.log(entity_data);
              if (err) {
              console.error(err);
              } else {
  //                      console.log(JSON.stringify(data, null, 2));
                      
                      //          discoveryResponse = bestPassage.passage_text; 
  //                      if (data.output) {
  
                              let i;
                              for(i =0; i < entity_data.values.length; i++){
                                      data.output.text.push(JSON.stringify(entity_data.values[i].value));
                      console.log(entity_data.values[i].value);
                              }
                              
                              //console.log(entity_data.values);
                              //data.output.text.push(JSON.stringify(entity_data));
              }
                      // Clear the context's action since the lookup and append was completed.
                  data.context.action = {};
                      callback(null, data);
              // Clear the context's action since the lookup was completed.
                      payload.context.action = {};
                      
      });
    } else if (data.context.action.lookup === UPDATE_DIALOGUE) { // to be tested
      console.log('hello')
      console.log('************** UPDATE_DIALOGUE *************** InputText : ' + payload.input.text + ' ' + data.context.action.lookup);
      console.log(data);
      var topics = {
      	workspace_id: workspaceID,
      	entity: 'topics'
      };
      assistant.listValues(topics, function(err, entity_data) {
              console.log(data);
              console.log(entity_data);
              if (err) {
              console.error(err);
              } else {
  //                      console.log(JSON.stringify(data, null, 2));
                      
                      //          discoveryResponse = bestPassage.passage_text; 
  //                      if (data.output) {
  
                              let i;
                              var topic_exists = 0;
                              for(i =0; i < entity_data.values.length; i++){
                      				console.log(entity_data.values[i].value);
                                      if(entity_data.values[i].value === data.context.key){
                                      	console.log('UPDATE DIALOGUE NODE TOPIC WITH NEW PASSAGE');
                                      	topic_exists = 1;
                                      	break;
                                      }
                      
                              }
                              if(topic_exists != 1){
                              console.log('NEW TOPIC: ADD DIALOGUE NODE ');
                              // UPDATE ENTITY VALUE
                              var params = {
								  workspace_id: workspaceID,
								  entity: 'topics',
								  value: data.context.key
								};

								assistant.createValue(params, function(err, response) {
								  if (err) {
									console.error(err);
								  } else {
									console.log(JSON.stringify(response, null, 2));
								  } 
								});
                              let condition = '@topics:' + data.context.key;
                              console.log(condition);
                              var params = {
  								workspace_id: workspaceID,
 								dialog_node: data.context.key,
  								conditions: condition,
  								output: {
    								text: data.context.new_passage
  								},
  								title: data.context.key,
  								previous_sibiling: 'node_3_1531784387906', // stability
  								parent: 'node_1_1531784196478'
							};

							assistant.createDialogNode(params, function(err, response) {
							  if (err) {
								console.error(err);
							  } else {
								console.log(JSON.stringify(response, null, 2));
								  // Clear the context's action since the lookup and append was completed.
                  data.context.action = {};
                  data.context.key = null;
                  data.context.new_passage = null;
                      callback(null, data);
              // Clear the context's action since the lookup was completed.
                      payload.context.action = {};
							  }
							});
							}
							else{
								console.log('topic exists... update node response');
							}
                              //console.log(entity_data.values);
                              //data.output.text.push(JSON.stringify(entity_data));
                      }
                      
      });
    } else if (data.context.action.lookup === VERIFY_TOPIC_NAME) {
      console.log('hello')
      console.log('************** Verify Topic Name *************** InputText : ' + payload.input.text + ' ' + data.context.action.lookup);
     // console.log(data);
      console.log(data.context.keywords);
      data.context.key = data.context.keywords[0].text;
      // Clear the context's action since the lookup and append was attempted.
        data.context.action = {};
        callback(null, data);
        // Clear the context's action since the lookup was attempted.
        payload.context.action = {};
} else if (data.context.action.lookup === DISCOVERY_ACTION) {
      console.log('************** Discovery *************** InputText : ' + payload.input.text + ' ' + data.context.action.lookup); // + data.context.action.lookup < ------------- new
      let discoveryResponse = '';
//      if (data.context.isRelevant === 'no')
		//console.log('PAY
	  if (data.context.inputQuery === null) {
	  	data.context.inputQuery = payload.input.text; 
	//  	data.context.key = payload.context.nlu_output;
			  const parameters = {
		text: payload.input.text,
		features: {
		  entities: {
		    emotion: true,
		    sentiment: true,
		    limit: 2
		  },
		  keywords: {
		    emotion: true,
		    sentiment: true,
		    limit: 2
		  }
		}
	  };
          console.log('PARAMETERS SET');
	  nlu.analyze(parameters, function(err, response) {
		        if (err) {
		          console.log('error:', err);
		        } else {
		          data.context.nlu_output = response;

		           console.log('NLU = ', data.context.nlu_output);
		          // identify location
		          const entities = data.context.nlu_output.entities;
		          console.log('ENTITIES:' + entities);
		          console.log('KEYWORDS:' + data.context.nlu_output.keywords);
		          /*
		          let location = entities.map(function(entry) {
		            if (entry.type == 'Location') {
		              return entry.text;
		            }
		          });
		          */
		          if(data.context.nlu_output.keywords[0] !== undefined){
		          console.log(typeof data.context.nlu_output.keywords[0]);
			          data.context.key = data.context.nlu_output.keywords[0].text;
			          }
			          else {
			          	console.log('no keywords');
			          	}
		          }
		 });
	  	console.log('KEY = ', data.context.key);
	  }
	  else {
	  	payload.input.text = data.context.inputQuery;
	  }
	  if (data.context.isRelevant !== null ) {
	  	if(data.context.isRelevant === 0) {
	  		console.log('Answer not relevant;');
	  		console.log('clearing relevancy');
	  		data.context.isRelevant = null;
	  		data.context.field++;
	  	}
	  	else{
	  		console.log('\n\n\n\n\n\nANSWER RELEVANT!! DEBUG FIELD');
	  		data.context.inputQuery = null;
	  		data.context.isRelevant = null;
	  	}
	  	data.context.isRelevant = null;
	  }
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
          passages: true,
          highlight: true
        };
        Object.assign(queryParams, discoveryParams);
        discovery.query(queryParams, (err, searchResponse) => {
          discoveryResponse = 'XXXSorry, currently I do not have a response. Our Customer representative will get in touch with you shortly.';
          if (err) {
            console.error('Error searching for documents: ' + err);
          } else if (searchResponse.passages.length > 0) {
            const bestPassage = searchResponse.passages[data.context.field]; // THIS WILL GRAB THE ZEROETH PASSAGE
            console.log('Passage score: ', bestPassage.passage_score);
            console.log('Passage text: ', bestPassage.passage_text);
         //   console.log('Full Discovery RESPONSE: ', searchResponse);

            // Trim the passage to try to get just the answer part of it.
            const lines = bestPassage.passage_text;
            let bestLine = lines;
            let questionFound = true;
            /*
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
            */
            /* ORIGINAL
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
            }*/
            discoveryResponse =
              bestLine || 'XXXXSorry I currently do not have an appropriate response for your query. Our customer care executive will call you in 24 hours.';
            // EXTRA SPEECH CAPABILITY
   /*    speech to text      {
  "url": "https://stream.watsonplatform.net/speech-to-text/api",
  "username": "1ed4341f-3ecf-42f6-bd8b-d06862702bc9",
  "password": "FGnmk2RHoX2v"
}*/
/*
{
  "url": "https://stream.watsonplatform.net/text-to-speech/api",
  "username": "63348a74-f75b-43b7-b08f-f3c9a68aa8f8",
  "password": "Ghj7Uejo5XFB"
} text to speech ^

			/* SYNTHESIZE AUDIO */
			/*
			var TextToSpeechV1 = require('watson-developer-cloud/text-to-speech/v1');
			var fs = require('fs');

			var textToSpeech = new TextToSpeechV1({
			  username: '63348a74-f75b-43b7-b08f-f3c9a68aa8f8',
			  password: 'Ghj7Uejo5XFB'
			});

			var synthesizeParams = {
			  text: bestLine,
			  accept: 'audio/wav',
			  voice: 'en-US_AllisonVoice'
			};

			// Pipe the synthesized text to a file.
			textToSpeech.synthesize(synthesizeParams).on('error', function(error) {
			  console.log(error);
			}).pipe(fs.createWriteStream('hello_world.wav'));

			// TO PLAY
/*			
			var Sound = require('node-aplay');

			// fire and forget: 
			//new Sound('/home/efwoods/quantum-chatbot/hello_world.wav').play();
			new Sound('./hiya.wav').play();
/*			
			//new Audio('./hello_world.wav').play();
			
			*/
		//	console.log('CREATEDAUDIO---------------------------------------');
			// END SYNTH

			// TO PLAY
			/*
			var Sound = require('node-aplay');

			// fire and forget: 
			//new Sound('/home/efwoods/quantum-chatbot/hello_world.wav').play();
			new Sound('./hello_world.wav').play();
			*/
			//new Audio('./hello_world.wav').play();
		
		/*
			const audio_player = require('./play_sound');
			audio_player.play();
			
			console.log('PLAYINGAUDIO---------------------------------------');
			// END SYNTH
			*/
          }

          if(discoveryResponse.search("Sorry") !== -1){ // sorry was not found in the string... discovery does not have a response...
          	console.log('questionFound');

          	data.context.action = {}
          	data.context.inputQuery = null;
			data.context.isRelevant = null;
			data.context.field = 0;
			data.context.END_OF_SEARCH = null;
			data.context.new_passage = null;
			data.context.key = null;
		}

          // discoveryResponse = bestPassage.passage_text; 
          // console.log('before the push');
          // console.log(JSON.stringify(data, null, 2));
          if (data.output.text) {
            data.output.text.push(discoveryResponse);    // <<<< THIS SHOWS THE DISCOVERY RESPONSE ON THE FRONT END
            data.context.new_passage = discoveryResponse;
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
