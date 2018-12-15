/* eslint-disable  func-names */
/* eslint-disable  no-console */
/* eslint-disable  no-restricted-syntax */
/* eslint-disable  consistent-return */

const alexa = require('ask-sdk');
const constants = require('./constants');


/* INTENT HANDLERS */

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
    },

    async handle(handlerInput) {
        console.log('--Launch Request --');
        const playbackInfo = await getPlaybackInfo(handlerInput);
        let message;
        let reprompt;

        if (!playbackInfo.hasPreviousPlaybackSession) {
            message = 'Bienvenido a la skill Profesor de guitarra. ¿Qué quieres aprender hoy?';
            reprompt = 'Puedes decir, enséñame un nuevo acorde';
        } else {
            playbackInfo.inPlaybackSession = false;
            message = `Estabas practicando el acorde ${constants.audioData[playbackInfo.playOrder[playbackInfo.index]].title}. ¿Quieres seguir reproduciendo el acorde?`;
        }

        return handlerInput.responseBuilder
            .speak(message)
            .withShouldEndSession(false)
            .getResponse();
    },
};

const AudioPlayerEventHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type.startsWith('AudioPlayer.');
    },
    async handle(handlerInput) {
        console.log('--AudioPlayer Handler --');
        const {
            requestEnvelope,
            attributesManager,
            responseBuilder
        } = handlerInput;
        const audioPlayerEventName = requestEnvelope.request.type.split('.')[1];
        const {
            playbackSetting,
            playbackInfo
        } = await attributesManager.getPersistentAttributes();

        switch (audioPlayerEventName) {
            case 'PlaybackStarted':
                console.log('--PlaybackStarted --');
                playbackInfo.token = getToken(handlerInput);
                playbackInfo.index = await getIndex(handlerInput);
                playbackInfo.inPlaybackSession = true;
                playbackInfo.hasPreviousPlaybackSession = true;
                break;
            case 'PlaybackFinished':
                console.log('--PlaybackFinished --');
                playbackInfo.inPlaybackSession = false;
                playbackInfo.hasPreviousPlaybackSession = false;
                playbackInfo.nextStreamEnqueued = false;
                break;
            case 'PlaybackStopped':
                console.log('--PlaybackStopped --');
                playbackInfo.token = getToken(handlerInput);
                playbackInfo.index = await getIndex(handlerInput);
                playbackInfo.offsetInMilliseconds = getOffsetInMilliseconds(handlerInput);
                break;
            case 'PlaybackNearlyFinished':
            {
                console.log('--PlaybackNearlyFinished --');
                if (playbackInfo.nextStreamEnqueued) {
                    break;
                }

                const enqueueIndex = (playbackInfo.index ) % constants.audioData.length;

                if (enqueueIndex === 0 && !playbackSetting.loop) {
                    break;
                }

                playbackInfo.nextStreamEnqueued = true;

                const enqueueToken = playbackInfo.playOrder[enqueueIndex];
                const playBehavior = 'ENQUEUE';
                const podcast = constants.audioData[playbackInfo.playOrder[enqueueIndex]];
                const expectedPreviousToken = playbackInfo.token;
                const offsetInMilliseconds = 0;

                responseBuilder.addAudioPlayerPlayDirective(
                    playBehavior,
                    podcast.url,
                    enqueueToken,
                    offsetInMilliseconds,
                    expectedPreviousToken,
                );
                break;
            }
            case 'PlaybackFailed':
                console.log('--PlaybackFailed --');
                playbackInfo.inPlaybackSession = false;
                console.log('Playback Failed : %j', handlerInput.requestEnvelope.request.error);
                return;
            default:
                throw new Error('Should never reach here!');
        }

        return responseBuilder.getResponse();
    },
};

const CheckAudioInterfaceHandler = {
    async canHandle(handlerInput) {
        const audioPlayerInterface = ((((handlerInput.requestEnvelope.context || {}).System || {}).device || {}).supportedInterfaces || {}).AudioPlayer;
        return audioPlayerInterface === undefined
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak('Lo siento pero esta skill no está soportada para este tipo de dispositivo')
            .withShouldEndSession(true)
            .getResponse();
    },
};

const StartPlaybackHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;
        console.log('--StartPlaybackHandler --');
        if (!playbackInfo.inPlaybackSession) {
            return request.type === 'IntentRequest' && request.intent.name === 'acordeIntent';
        }
        if (request.type === 'PlaybackController.PlayCommandIssued') {
            return true;
        }

        if (request.type === 'IntentRequest') {
            return request.intent.name === 'acordeIntent' ||
                request.intent.name === 'AMAZON.ResumeIntent';
        }
    },
    handle(handlerInput) {
        return controller.play(handlerInput);
    },
};


const NextPlaybackHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;
        console.log('--NextPlaybackHandler --');

        return playbackInfo.inPlaybackSession &&
            (request.type === 'PlaybackController.NextCommandIssued' ||
                (request.type === 'IntentRequest' && request.intent.name === 'AMAZON.NextIntent'));
    },
    handle(handlerInput) {
        return controller.playNext(handlerInput);
    },
};

const PreviousPlaybackHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;
        console.log('--PreviousPlaybackHandler --');

        return playbackInfo.inPlaybackSession &&
            (request.type === 'PlaybackController.PreviousCommandIssued' ||
                (request.type === 'IntentRequest' && request.intent.name === 'AMAZON.PreviousIntent'));
    },
    handle(handlerInput) {
        return controller.playPrevious(handlerInput);
    },
};

const PausePlaybackHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;
        console.log('--PausePlaybackHandler --');

        return playbackInfo.inPlaybackSession &&
            request.type === 'IntentRequest' &&
            (request.intent.name === 'AMAZON.StopIntent' ||
                request.intent.name === 'AMAZON.CancelIntent' ||
                request.intent.name === 'AMAZON.PauseIntent');
    },
    handle(handlerInput) {
        return controller.stop(handlerInput);
    },
};

const LoopOnHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;
        console.log('--LoopON --');

        return playbackInfo.inPlaybackSession &&
            request.type === 'IntentRequest' &&
            request.intent.name === 'AMAZON.LoopOnIntent';
    },
    async handle(handlerInput) {
        const playbackSetting = await handlerInput.attributesManager.getPersistentAttributes().playbackSettings;

        playbackSetting.loop = true;

        return handlerInput.responseBuilder
            .speak('Reproducción en bucle activada.')
            .getResponse();
    },
};

const LoopOffHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;
        console.log('--LoopOFF --');
        return playbackInfo.inPlaybackSession &&
            request.type === 'IntentRequest' &&
            request.intent.name === 'AMAZON.LoopOffIntent';
    },
    async handle(handlerInput) {
        const playbackSetting = await handlerInput.attributesManager.getPersistentAttributes().playbackSetting;

        playbackSetting.loop = false;

        return handlerInput.responseBuilder
            .speak('Reproducción en bucle desactivada.')
            .getResponse();
    },
};

const ShuffleOnHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;
        console.log('--ShuffleON --');
        return playbackInfo.inPlaybackSession &&
            request.type === 'IntentRequest' &&
            request.intent.name === 'AMAZON.ShuffleOnIntent';
    },
    async handle(handlerInput) {
        const {
            playbackInfo,
            playbackSetting,
        } = await handlerInput.attributesManager.getPersistentAttributes();

        playbackSetting.shuffle = true;
        playbackInfo.playOrder = await shuffleOrder();
        playbackInfo.index = 0;
        playbackInfo.offsetInMilliseconds = 0;
        playbackInfo.playbackIndexChanged = true;
        return controller.play(handlerInput);
    },
};

const ShuffleOffHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;
        console.log('--ShuffleOFF --');
        return playbackInfo.inPlaybackSession &&
            request.type === 'IntentRequest' &&
            request.intent.name === 'AMAZON.ShuffleOffIntent';
    },
    async handle(handlerInput) {
        const {
            playbackInfo,
            playbackSetting,
        } = await handlerInput.attributesManager.getPersistentAttributes();

        if (playbackSetting.shuffle) {
            playbackSetting.shuffle = false;
            playbackInfo.index = playbackInfo.playOrder[playbackInfo.index];
            playbackInfo.playOrder = [...Array(constants.audioData.length).keys()];
        }

        return controller.play(handlerInput);
    },
};

const StartOverHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;
        console.log('--StartOverHandler --');

        return playbackInfo.inPlaybackSession &&
            request.type === 'IntentRequest' &&
            request.intent.name === 'AMAZON.StartOverIntent';
    },
    async handle(handlerInput) {
        const playbackInfo = await handlerInput.attributesManager.getPersistentAttributes().playbackInfo;

        playbackInfo.offsetInMilliseconds = 0;

        return controller.play(handlerInput);
    },
};

const YesHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;

        return !playbackInfo.inPlaybackSession && request.type === 'IntentRequest' && request.intent.name === 'AMAZON.YesIntent';
    },
    handle(handleInput) {
        return controller.play(handleInput);
    },
};

const NoHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;

        return !playbackInfo.inPlaybackSession && request.type === 'IntentRequest' && request.intent.name === 'AMAZON.NoIntent';
    },
    async handle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);

        playbackInfo.index = 0;
        playbackInfo.offsetInMilliseconds = 0;
        playbackInfo.playbackIndexChanged = true;
        playbackInfo.hasPreviousPlaybackSession = false;

        return controller.play(handlerInput);
    },
};

const HelpHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest' &&
            handlerInput.requestEnvelope.request.intent.name === 'AMAZON.HelpIntent';
    },
    async handle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        let message;

        if (!playbackInfo.hasPreviousPlaybackSession) {
            message = 'Soy tu profesor de guitarra. Puedes pedirme reproducir los acordes para que puedas practicarlos y además te los mostraré en tu dispositivo o app Alexa. Una vez que aprendas el acorde, podrás decir, siguiente o previo para ir conociendo el resto de acordes. En cualquier momento, puedes parar y continuar con la reproducción. ';
        } else if (!playbackInfo.inPlaybackSession) {
            message = `Estás aprendiendo el acorde ${constants.audioData[playbackInfo.index].title}. ¿Quieres continuar con la reproducción?`;
        } else {
            message = 'Soy tu profesor de guitarra. Puedes pedirme reproducir los acordes para que puedas practicarlos y además te los mostraré en tu dispositivo o app Alexa. Una vez que aprendas el acorde, podrás decir, siguiente o previo para ir conociendo el resto de acordes. En cualquier momento, puedes parar y continuar con la reproducción. ';
        }

        return handlerInput.responseBuilder
            .speak(message)
            .reprompt(message)
            .getResponse();
    },
};

const ExitHandler = {
    async canHandle(handlerInput) {
        const playbackInfo = await getPlaybackInfo(handlerInput);
        const request = handlerInput.requestEnvelope.request;


        return !playbackInfo.inPlaybackSession &&
            request.type === 'IntentRequest' &&
            (request.intent.name === 'AMAZON.StopIntent' ||
                request.intent.name === 'AMAZON.CancelIntent');
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak('Vale. Hasta luego.')
            .getResponse();
    },
};

const SystemExceptionHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'System.ExceptionEncountered';
    },
    handle(handlerInput) {
        console.log(`System exception encountered: ${handlerInput.requestEnvelope.request.reason}`);
    },
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);

        return handlerInput.responseBuilder.getResponse();
    },
};
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log(`Error handled: ${error.message}`);
        const message = 'Lo siento, pero no puedo hacer lo que me has pedido. Pídeme ayuda y te mostraré las opciones disponibles. ';

        return handlerInput.responseBuilder
            .speak(message)
            .reprompt(message)
            .getResponse();
    },
};

/* INTERCEPTORS */

const LoadPersistentAttributesRequestInterceptor = {
    async process(handlerInput) {
        const persistentAttributes = await handlerInput.attributesManager.getPersistentAttributes();

        // Check if user is invoking the skill the first time and initialize preset values
        if (Object.keys(persistentAttributes).length === 0) {
            handlerInput.attributesManager.setPersistentAttributes({
                playbackSetting: {
                    loop: false,
                    shuffle: false,
                },
                playbackInfo: {
                    playOrder: [...Array(constants.audioData.length).keys()],
                    index: 0,
                    offsetInMilliseconds: 0,
                    playbackIndexChanged: true,
                    token: '',
                    nextStreamEnqueued: false,
                    inPlaybackSession: false,
                    hasPreviousPlaybackSession: false,
                },
            });
        }
    },
};

const SavePersistentAttributesResponseInterceptor = {
    async process(handlerInput) {
        await handlerInput.attributesManager.savePersistentAttributes();
    },
};

/* HELPER FUNCTIONS */

async function getPlaybackInfo(handlerInput) {
    const attributes = await handlerInput.attributesManager.getPersistentAttributes();
    return attributes.playbackInfo;
}

async function canThrowCard(handlerInput) {
    const {
        requestEnvelope,
        attributesManager
    } = handlerInput;
    const playbackInfo = await getPlaybackInfo(handlerInput);

    if (requestEnvelope.request.type === 'IntentRequest' && playbackInfo.playbackIndexChanged) {
        playbackInfo.playbackIndexChanged = false;
        return true;
    }
    return false;
}

const controller = {
    async play(handlerInput) {
        console.log('--Controller PLAY--');
        const {
            attributesManager,
            responseBuilder
        } = handlerInput;

        const playbackInfo = await getPlaybackInfo(handlerInput);
        const {
            playOrder,
            offsetInMilliseconds,
            index
        } = playbackInfo;

        const playBehavior = 'REPLACE_ALL';
        const podcast = constants.audioData[playOrder[index]];
        const token = playOrder[index];
        playbackInfo.nextStreamEnqueued = false;

        responseBuilder
            .speak(`Este es el acorde ${podcast.title}`)
            .withShouldEndSession(true)
            .addAudioPlayerPlayDirective(playBehavior, podcast.url, token, offsetInMilliseconds, null);

        if (await canThrowCard(handlerInput)) {
            const cardTitle = 'Profesor de Guitarra';
            const cardContent = `Acorde: ${podcast.title}`;
            const cardImage = `${podcast.image}`
            responseBuilder.withStandardCard(cardTitle, cardContent, cardImage, cardImage);
        }

        return responseBuilder.getResponse();
    },
    stop(handlerInput) {
        console.log('--Controller STOP--');
        return handlerInput.responseBuilder
            .addAudioPlayerStopDirective()
            .getResponse();
    },
    async playNext(handlerInput) {
        console.log('--Controller PLAYNEXT --');
        const {
            playbackInfo,
            playbackSetting,
        } = await handlerInput.attributesManager.getPersistentAttributes();

        const nextIndex = (playbackInfo.index + 1) % constants.audioData.length;

        if (nextIndex === 0 && !playbackSetting.loop) {
            playbackInfo.index = nextIndex;
            playbackInfo.offsetInMilliseconds = 0;
            playbackInfo.playbackIndexChanged = true;
            return handlerInput.responseBuilder
                .speak('Bien!!! has aprendido todos los principales acordes de guitarra. ¡Enhorabuena, pronto serás una rock star!')
                .addAudioPlayerStopDirective()
                .withShouldEndSession(true)
                .getResponse();
        }

        playbackInfo.index = nextIndex;
        playbackInfo.offsetInMilliseconds = 0;
        playbackInfo.playbackIndexChanged = true;

        return this.play(handlerInput);
    },
    async playPrevious(handlerInput) {
        console.log('--Controller PLAYPREVIOUS --');
        const {
            playbackInfo,
            playbackSetting,
        } = await handlerInput.attributesManager.getPersistentAttributes();

        let previousIndex = playbackInfo.index - 1;

        if (previousIndex === -1) {
            if (playbackSetting.loop) {
                previousIndex += constants.audioData.length;
            } else {
                return handlerInput.responseBuilder
                    .speak('Estás en el principio de la lista de acordes.')
                    .addAudioPlayerStopDirective()
                    .getResponse();
            }
        }

        playbackInfo.index = previousIndex;
        playbackInfo.offsetInMilliseconds = 0;
        playbackInfo.playbackIndexChanged = true;

        return this.play(handlerInput);
    },
};

function getToken(handlerInput) {
    // Extracting token received in the request.
    return handlerInput.requestEnvelope.request.token;
}

async function getIndex(handlerInput) {
    // Extracting index from the token received in the request.
    const tokenValue = parseInt(handlerInput.requestEnvelope.request.token, 10);
    const attributes = await handlerInput.attributesManager.getPersistentAttributes();

    return attributes.playbackInfo.playOrder.indexOf(tokenValue);
}

function getOffsetInMilliseconds(handlerInput) {
    // Extracting offsetInMilliseconds received in the request.
    return handlerInput.requestEnvelope.request.offsetInMilliseconds;
}

function shuffleOrder() {
    const array = [...Array(constants.audioData.length).keys()];
    let currentIndex = array.length;
    let temp;
    let randomIndex;
    // Algorithm : Fisher-Yates shuffle
    return new Promise((resolve) => {
        while (currentIndex >= 1) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex -= 1;
            temp = array[currentIndex];
            array[currentIndex] = array[randomIndex];
            array[randomIndex] = temp;
        }
        resolve(array);
    });
}

const skillBuilder = alexa.SkillBuilders.standard();
exports.handler = skillBuilder
    .addRequestHandlers(
        CheckAudioInterfaceHandler,
        LaunchRequestHandler,
        HelpHandler,
        SystemExceptionHandler,
        SessionEndedRequestHandler,
        YesHandler,
        NoHandler,
        StartPlaybackHandler,
        NextPlaybackHandler,
        PreviousPlaybackHandler,
        PausePlaybackHandler,
        LoopOnHandler,
        LoopOffHandler,
        ShuffleOnHandler,
        ShuffleOffHandler,
        StartOverHandler,
        ExitHandler,
        AudioPlayerEventHandler
    )
    .addRequestInterceptors(LoadPersistentAttributesRequestInterceptor)
    .addResponseInterceptors(SavePersistentAttributesResponseInterceptor)
    .addErrorHandlers(ErrorHandler)
    .withAutoCreateTable(true)
    .withTableName(constants.skill.dynamoDBTableName)
    .lambda();