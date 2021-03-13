export default class RoomBroadcaster {
  constructor() {
    // Load mediaDevice options
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
  }
  async produce(type, deviceId = null) {
    let mediaConstraints = {};
    let audio = false;
    let screen = false;

    switch (type) {
      case super.rc.mediaType.audio:
        mediaConstraints = {
          audio: {
            deviceId: deviceId,
          },
          video: false,
        };
        audio = true;
        break;
      case super.rc.mediaType.video:
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
      case super.rc.mediaType.screen:
        mediaConstraints = false;
        screen = true;
        break;
      default:
        return;
        break;
    }
    if (!super.rc.device.canProduce('video') && !audio) {
      console.error('cannot produce video');
      return;
    }
    if (super.rc.producerLabel.has(type)) {
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
      const producer = await super.rc.producerTransport.produce(params);

      console.log('producer', producer);

      super.rc.producers.set(producer.id, producer);

      let elem;
      if (!audio) {
        elem = document.createElement('video');
        elem.srcObject = stream;
        elem.id = producer.id;
        elem.playsinline = false;
        elem.autoplay = true;
        elem.className = 'vid';
        super.rc.localMediaEl.appendChild(elem);
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

      super.rc.producerLabel.set(type, producer.id);

      switch (type) {
        case super.rc.mediaType.audio:
          super.rc.event(super.rc._EVENTS.startAudio);
          break;
        case super.rc.mediaType.video:
          super.rc.event(super.rc._EVENTS.startVideo);
          break;
        case super.rc.mediaType.screen:
          super.rc.event(super.rc._EVENTS.startScreen);
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
    if (!super.producerLabel.has(type)) {
      console.log('there is no producer for this type ' + type);
      return;
    }
    let producer_id = super.rc.producerLabel.get(type);
    console.log(producer_id);
    super.rc.socket.emit('producerClosed', {
      producer_id,
    });
    super.rc.producers.get(producer_id).close();
    super.rc.producers.delete(producer_id);
    super.rc.producerLabel.delete(type);

    if (type !== super.rc.mediaType.audio) {
      let elem = document.getElementById(producer_id);
      elem.srcObject.getTracks().forEach(function (track) {
        track.stop();
      });
      elem.parentNode.removeChild(elem);
    }

    switch (type) {
      case super.rc.mediaType.audio:
        super.rc.event(super.rc._EVENTS.stopAudio);
        break;
      case super.rc.mediaType.video:
        super.rc.event(super.rc._EVENTS.stopVideo);
        break;
      case super.rc.mediaType.screen:
        super.rc.event(super.rc._EVENTS.stopScreen);
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
