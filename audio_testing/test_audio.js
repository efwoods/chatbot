var TextToSpeechV1 = require('watson-developer-cloud/text-to-speech/v1');
			var fs = require('fs');

			var textToSpeech = new TextToSpeechV1({
			  username: '63348a74-f75b-43b7-b08f-f3c9a68aa8f8',
			  password: 'Ghj7Uejo5XFB'
			});

			var synthesizeParams = {
			  text: 'HEY baby',
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
			console.log('PLAYINGAUDIO---------------------------------------');
			// END SYNTH
			

