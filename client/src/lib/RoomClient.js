const mediaType = {
  audio: 'audioType',
  video: 'videoType',
  screen: 'screenType',
};
const _EVENTS = {
  exitRoom: 'exitRoom',
  openRoom: 'openRoom',
  startVideo: 'startVideo',
  stopVideo: 'stopVideo',
  startAudio: 'startAudio',
  stopAudio: 'stopAudio',
  startScreen: 'startScreen',
  stopScreen: 'stopScreen',
};

export default class RoomClient {
  constructor(
    localMediaEl,
    remoteVideoEl,
    remoteAudioEl,
    mediasoupClient,
    socket,
    room_id,
    name,
    isBroadcaster
  ) {
    socket.on('creator', () => {
      isBroadcaster();
      navigator.mediaDevices.enumerateDevices().then((devices) =>
        devices.forEach((device) => {
          let el = null;
          if ('audioinput' === device.kind) {
            el = document.getElementById('audioSelect');
          } else if ('videoinput' === device.kind) {
            el = document.getElementById('videoSelect');
          }
          if (!el) return;

          let option = document.createElement('option');
          option.value = device.deviceId;
          option.innerText = device.label;
          el.appendChild(option);
        })
      );
      this.creator = true;
    });
    this.name = name;
    this.localMediaEl = localMediaEl;
    this.remoteVideoEl = remoteVideoEl;
    this.remoteAudioEl = remoteAudioEl;
    this.mediasoupClient = mediasoupClient;

    this.socket = socket;
    this.producerTransport = null;
    this.consumerTransport = null;
    this.device = null;
    this.room_id = room_id;

    this.consumers = new Map();
    this.producers = new Map();

    this.broadcaster = null;
    this.creator = false;

    /**
     * map that contains a mediatype as key and producer_id as value
     */
    this.producerLabel = new Map();

    this._isOpen = false;
    this.eventListeners = new Map();
    Object.keys(_EVENTS).forEach(
      function (evt) {
        this.eventListeners.set(evt, []);
      }.bind(this)
    );

    this.socketRequest = (type, data = {}) => {
      return new Promise((resolve, reject) => {
        socket.emit(type, data, (data) => {
          if (data.error) {
            console.log('E: ' + data.error);
            reject(data.error);
          } else {
            console.log('R: ' + data);
            resolve(data);
          }
        });
      });
    };

    this.socket.on('count', (count) => {
      console.log(`There are ${count - 1} users watching this broadcast`);
    });

    this.createRoom(room_id).then(
      async function () {
        await this.join(name, room_id);
        this.initSockets();
        this._isOpen = true;
      }.bind(this)
    );
  }

  ////////// INIT /////////

  async createRoom(room_id) {
    console.log('createRoom()');
    await this.socketRequest('createRoom', {
      room_id,
    }).catch((err) => {
      console.log(err);
    });
  }

  async join(name, room_id) {
    console.log('join()');
    this.socketRequest('join', {
      name,
      room_id,
    })
      .then(
        async function (e) {
          console.log(e);
          const data = await this.socketRequest('getRouterRtpCapabilities');
          let device = await this.loadDevice(data);
          this.device = device;
          await this.initTransports(device);
          this.socket.emit('getProducers');
        }.bind(this)
      )
      .catch((e) => {
        console.log(e);
      });
  }

  async loadDevice(routerRtpCapabilities) {
    let device;
    try {
      console.log(this.mediasoupClient);
      device = new this.mediasoupClient.Device();
    } catch (error) {
      if (error.name === 'UnsupportedError') {
        console.error('browser not supported');
      }
      console.error(error);
    }
    await device.load({
      routerRtpCapabilities,
    });
    return device;
  }

  async initTransports(device) {
    // init producerTransport
    {
      const data = await this.socketRequest('createWebRtcTransport', {
        forceTcp: false,
        rtpCapabilities: device.rtpCapabilities,
      });
      if (data.error) {
        console.error(data.error);
        return;
      }

      this.producerTransport = device.createSendTransport(data);

      this.producerTransport.on(
        'connect',
        async function ({ dtlsParameters }, callback, errback) {
          this.socketRequest('connectTransport', {
            dtlsParameters,
            transport_id: data.id,
          })
            .then(callback)
            .catch(errback);
        }.bind(this)
      );

      this.producerTransport.on(
        'produce',
        async function ({ kind, rtpParameters }, callback, errback) {
          try {
            const { producer_id } = await this.socketRequest('produce', {
              producerTransportId: this.producerTransport.id,
              kind,
              rtpParameters,
            });
            callback({
              id: producer_id,
            });
          } catch (err) {
            errback(err);
          }
        }.bind(this)
      );

      this.producerTransport.on(
        'connectionstatechange',
        function (state) {
          switch (state) {
            case 'connecting':
              break;

            case 'connected':
              //localVideo.srcObject = stream
              break;

            case 'failed':
              this.producerTransport.close();
              break;

            default:
              break;
          }
        }.bind(this)
      );
    }

    // init consumerTransport
    {
      const data = await this.socketRequest('createWebRtcTransport', {
        forceTcp: false,
      });
      if (data.error) {
        console.error(data.error);
        return;
      }

      // only one needed
      this.consumerTransport = device.createRecvTransport(data);

      this.consumerTransport.on(
        'connect',
        function ({ dtlsParameters }, callback, errback) {
          this.socket
            .request('connectTransport', {
              transport_id: this.consumerTransport.id,
              dtlsParameters,
            })
            .then(callback)
            .catch(errback);
        }.bind(this)
      );

      this.consumerTransport.on(
        'connectionstatechange',
        async function (state) {
          switch (state) {
            case 'connecting':
              break;

            case 'connected':
              //remoteVideo.srcObject = await stream;
              //await socket.request('resume');
              break;

            case 'failed':
              this.consumerTransport.close();
              break;

            default:
              break;
          }
        }.bind(this)
      );
    }
  }

  initSockets() {
    this.socket.on(
      'consumerClosed',
      function ({ consumer_id }) {
        console.log('closing consumer:', consumer_id);
        this.removeConsumer(consumer_id);
      }.bind(this)
    );
    this.socket.on('newMessage', function (name, data) {
      console.log(`${name} says ${data}`);
    });

    /**
     * data: [ {
     *  producer_id:
     *  producer_socket_id:
     * }]
     */
    this.socket.on(
      'newProducers',
      async function (data) {
        console.log('new producers', data);

        for (let { producer_id } of data) {
          await this.consume(producer_id);
        }
      }.bind(this)
    );

    this.socket.on(
      'disconnect',
      function () {
        this.exit(true);
      }.bind(this)
    );
  }

  //////// MAIN FUNCTIONS /////////////

  async consume(producer_id) {
    //let info = await roomInfo()
    console.log('consume ', producer_id);
    console.log('dddddddddddd', await this.getConsumeStream(producer_id));
    this.getConsumeStream(producer_id).then(
      function ({ consumer, stream, kind }) {
        console.log('blah');
        this.consumers.set(consumer.id, consumer);

        let elem;
        console.log('clg kind === ', kind);
        if (kind === 'video') {
          console.log('cons vid');
          elem = document.createElement('video');
          elem.srcObject = stream;
          elem.id = consumer.id;
          elem.playsinline = false;
          elem.autoplay = true;
          elem.className = 'vid';
          this.remoteVideoEl.appendChild(elem);
        } else {
          elem = document.createElement('audio');
          elem.srcObject = stream;
          elem.id = consumer.id;
          elem.playsinline = false;
          elem.autoplay = true;
          this.remoteAudioEl.appendChild(elem);
        }

        consumer.on(
          'trackended',
          function () {
            this.removeConsumer(consumer.id);
          }.bind(this)
        );
        consumer.on(
          'transportclose',
          function () {
            this.removeConsumer(consumer.id);
          }.bind(this)
        );
      }.bind(this)
    );
  }

  async getConsumeStream(producerId) {
    const { rtpCapabilities } = this.device;
    console.log('rtpcaps ', rtpCapabilities);
    const data = await this.socketRequest('consume', {
      rtpCapabilities,
      consumerTransportId: this.consumerTransport.id, // might be
      producerId,
    }).then((data) => {
      console.log('daaatttaaa', data);
      return data;
    });
    const { id, kind, rtpParameters } = data;

    console.log('data === ', data);

    let codecOptions = {};
    console.log('aaaaaaaaaaaaaa', this.consumerTransport.consume);
    const consumer = await this.consumerTransport
      .consume({
        id,
        producerId,
        kind,
        rtpParameters,
        codecOptions,
      })
      .then((result) => {
        console.log('bbbbbbb', result);
        return result;
      });
    console.log('consumer === ', consumer);

    const stream = new MediaStream();
    console.log('stream === ', stream);
    stream.addTrack(consumer.track);
    console.log('kind ', kind);
    return {
      consumer,
      stream,
      kind,
    };
  }

  removeConsumer(consumer_id) {
    let elem = document.getElementById(consumer_id);
    elem.srcObject.getTracks().forEach(function (track) {
      track.stop();
    });
    elem.parentNode.removeChild(elem);

    this.consumers.delete(consumer_id);
  }

  exit(offline = false) {
    let clean = function () {
      this._isOpen = false;
      this.consumerTransport.close();
      this.producerTransport.close();
      this.socket.off('disconnect');
      this.socket.off('newProducers');
      this.socket.off('consumerClosed');
    }.bind(this);

    if (!offline) {
      this.socketRequest('exitRoom')
        .then((e) => console.log(e))
        .catch((e) => console.warn(e))
        .finally(
          function () {
            clean();
          }.bind(this)
        );
    } else {
      clean();
    }

    this.event(_EVENTS.exitRoom);
  }

  ///////  HELPERS //////////

  async roomInfo() {
    let info = await this.socketRequest('getMyRoomInfo');
    return info;
  }

  static get mediaType() {
    return mediaType;
  }

  event(evt) {
    if (this.eventListeners.has(evt)) {
      this.eventListeners.get(evt).forEach((callback) => callback());
    }
  }

  on(evt, callback) {
    this.eventListeners.get(evt).push(callback);
  }

  //////// GETTERS ////////

  isOpen() {
    return this._isOpen;
  }

  static get EVENTS() {
    return _EVENTS;
  }

  /////////////////////////////////////////////////////////////////////////////////////////////////BROADCASTER

  async produce(type, deviceId = null) {
    let mediaConstraints = {};
    let audio = false;
    let screen = false;

    switch (type) {
      case mediaType.audio:
        mediaConstraints = {
          audio: {
            deviceId: deviceId,
          },
          video: false,
        };
        audio = true;
        break;
      case mediaType.video:
        mediaConstraints = {
          audio: false,
          video: {
            width: {
              min: 640,
              ideal: 1920,
            },
            height: {
              min: 400,
              ideal: 1080,
            },
            deviceId: deviceId,
            /*aspectRatio: {
                          ideal: 1.7777777778
                      }*/
          },
        };
        break;
      case mediaType.screen:
        mediaConstraints = false;
        screen = true;
        break;
      default:
        return;
        break;
    }
    if (this.device && !this.device.canProduce('video') && !audio) {
      console.error('cannot produce video');
      return;
    }
    if (this.producerLabel.has(type)) {
      console.log('producer already exists for this type ' + type);
      return;
    }
    console.log('mediacontraints:', mediaConstraints);
    let stream;
    try {
      stream = screen
        ? await navigator.mediaDevices.getDisplayMedia()
        : await navigator.mediaDevices.getUserMedia(mediaConstraints);
      console.log(navigator.mediaDevices.getSupportedConstraints());

      const track = audio
        ? stream.getAudioTracks()[0]
        : stream.getVideoTracks()[0];
      const params = {
        track,
      };
      if (!audio && !screen) {
        params.encodings = [
          {
            rid: 'r0',
            maxBitrate: 100000,
            //scaleResolutionDownBy: 10.0,
            scalabilityMode: 'S1T3',
          },
          {
            rid: 'r1',
            maxBitrate: 300000,
            scalabilityMode: 'S1T3',
          },
          {
            rid: 'r2',
            maxBitrate: 900000,
            scalabilityMode: 'S1T3',
          },
        ];
        params.codecOptions = {
          videoGoogleStartBitrate: 1000,
        };
      }
      const producer = await this.producerTransport.produce(params);

      console.log('producer', producer);

      this.producers.set(producer.id, producer);

      let elem;
      if (!audio) {
        elem = document.createElement('video');
        elem.srcObject = stream;
        elem.id = producer.id;
        elem.playsinline = false;
        elem.autoplay = true;
        elem.className = 'vid';
        this.localMediaEl.appendChild(elem);
      }

      producer.on('trackended', () => {
        this.closeProducer(type);
      });

      producer.on('transportclose', () => {
        console.log('producer transport close');
        if (!audio) {
          elem.srcObject.getTracks().forEach(function (track) {
            track.stop();
          });
          elem.parentNode.removeChild(elem);
        }
        this.producers.delete(producer.id);
      });

      producer.on('close', () => {
        console.log('closing producer');
        if (!audio) {
          elem.srcObject.getTracks().forEach(function (track) {
            track.stop();
          });
          elem.parentNode.removeChild(elem);
        }
        this.producers.delete(producer.id);
      });

      this.producerLabel.set(type, producer.id);

      switch (type) {
        case mediaType.audio:
          this.event(_EVENTS.startAudio);
          break;
        case mediaType.video:
          this.event(_EVENTS.startVideo);
          break;
        case mediaType.screen:
          this.event(_EVENTS.startScreen);
          break;
        default:
          return;
          break;
      }
    } catch (err) {
      console.log(err);
    }
  }

  closeProducer(type) {
    if (!this.producerLabel.has(type)) {
      console.log('there is no producer for this type ' + type);
      return;
    }
    let producer_id = this.producerLabel.get(type);
    console.log(producer_id);
    this.socket.emit('producerClosed', {
      producer_id,
    });
    this.producers.get(producer_id).close();
    this.producers.delete(producer_id);
    this.producerLabel.delete(type);

    if (type !== mediaType.audio) {
      let elem = document.getElementById(producer_id);
      elem.srcObject.getTracks().forEach(function (track) {
        track.stop();
      });
      elem.parentNode.removeChild(elem);
    }

    switch (type) {
      case mediaType.audio:
        this.event(_EVENTS.stopAudio);
        break;
      case mediaType.video:
        this.event(_EVENTS.stopVideo);
        break;
      case mediaType.screen:
        this.event(_EVENTS.stopScreen);
        break;
      default:
        return;
        break;
    }
  }

  pauseProducer(type) {
    if (!this.producerLabel.has(type)) {
      console.log('there is no producer for this type ' + type);
      return;
    }
    let producer_id = this.producerLabel.get(type);
    this.producers.get(producer_id).pause();
  }

  resumeProducer(type) {
    if (!this.producerLabel.has(type)) {
      console.log('there is no producer for this type ' + type);
      return;
    }
    let producer_id = this.producerLabel.get(type);
    this.producers.get(producer_id).resume();
  }
}
