import { Fragment, useEffect, useRef, useState } from 'react';
import RoomClient from '../lib/RoomClient';
import * as mediasoupClient from 'mediasoup-client';
import { useHistory } from 'react-router-dom';
import { socket } from '../service/socket';

const Room = (props) => {
  const [rc, setRc] = useState();
  const startScreenButton = useRef();
  const stopScreenButton = useRef();
  const startAudioButton = useRef();
  const stopAudioButton = useRef();
  const startVideoButton = useRef();
  const stopVideoButton = useRef();
  const audioSelect = useRef();
  const videoSelect = useRef();
  const chatValue = useRef();
  const videos = useRef();
  const localMediaEl = useRef();
  const remoteVideoEl = useRef();
  const remoteAudioEl = useRef();
  const [broadcaster, setBroadcaster] = useState(false);
  const renderCount = useRef(1);

  const history = useHistory();

  useEffect(() => {
    if (renderCount.current === 1) {
      socket.emit('hello');
      socket.on('welcome', (data) => {
        console.log(`welcome from server ${data}`);
      });
      joinRoom(props.match.params.user, props.match.params.room);
      renderCount.current = renderCount.current + 1;
    }
  });

  // ARE WE THE BROADCASTER?
  useEffect(() => {
    if (renderCount.current > 1 && broadcaster === true)
      console.log('SERVER SAYS WE ARE THE BROADCASTER!!!!!!!!!!!!!!!');
  }, [broadcaster]);

  const isBroadcaster = () => {
    setBroadcaster(true);
  };
  // END

  const joinRoom = (name, room_id) => {
    if (rc && typeof rc.isOpen === 'function') {
      console.log('already connected to a room');
    } else {
      setRc(
        new RoomClient(
          localMediaEl.current,
          remoteVideoEl.current,
          remoteAudioEl.current,
          mediasoupClient,
          socket,
          room_id,
          name,
          isBroadcaster
        )
      );

      addListeners();
    }
    console.log(`Welcome to room: ${room_id}, ${name}`);
  };

  function hide(elem) {
    elem.current.className = 'hidden';
  }
  function reveal(elem) {
    elem.current.className = '';
  }

  function addListeners() {
    if (broadcaster && rc) {
      rc.on(RoomClient.EVENTS.startScreen, () => {
        hide(startScreenButton);
        reveal(stopScreenButton);
      });

      rc.on(RoomClient.EVENTS.stopScreen, () => {
        hide(stopScreenButton);
        reveal(startScreenButton);
      });

      rc.on(RoomClient.EVENTS.stopAudio, () => {
        hide(stopAudioButton);
        reveal(startAudioButton);
      });
      rc.on(RoomClient.EVENTS.startAudio, () => {
        hide(startAudioButton);
        reveal(stopAudioButton);
      });

      rc.on(RoomClient.EVENTS.startVideo, () => {
        hide(startVideoButton);
        reveal(stopVideoButton);
      });
      rc.on(RoomClient.EVENTS.stopVideo, () => {
        hide(stopVideoButton);
        reveal(startVideoButton);
      });
    }
    if (rc)
      socket.on(RoomClient.EVENTS.exitRoom, () => {
        history.push('/');
      });
  }
  const sendMessage = (message) => {
    socket.emit('message', message);
  };
  const exit = () => {
    rc.exit();
    history.push('/');
  };
  return (
    <Fragment>
      {rc && (
        <button id='exitButton' onClick={exit}>
          Exit
        </button>
      )}
      {broadcaster && <span>broadcaster!</span>}
      {broadcaster && rc && (
        <>
          <div>
            <span>audio:</span>
            <select id='audioSelect'></select>
            <br />
            video:
            <select id='videoSelect'></select>
            <br />
            <button
              id='startAudioButton'
              onClick={() =>
                rc.produce(RoomClient.mediaType.audio, audioSelect.value)
              }>
              audio
            </button>
            <button
              id='stopAudioButton'
              onClick={() => rc.closeProducer(RoomClient.mediaType.audio)}>
              close audio
            </button>
            <button
              id='startVideoButton'
              onClick={() =>
                rc.produce(RoomClient.mediaType.video, videoSelect.value)
              }>
              video
            </button>
            <button
              id='stopVideoButton'
              onClick={() => rc.closeProducer(RoomClient.mediaType.video)}>
              close video
            </button>
            <button
              id='startScreenButton'
              onClick={() => rc.produce(RoomClient.mediaType.screen)}>
              screen
            </button>
            <button
              id='stopScreenButton'
              onClick={() => rc.closeProducer(RoomClient.mediaType.screen)}>
              close screen
            </button>
          </div>
        </>
      )}
      <div id='chat'>
        Chat:{' '}
        <input id='chatInput' ref={chatValue} defaultValue='hi' type='text' />
        <button
          id='chatButton'
          onClick={() => sendMessage(chatValue.current.value)}>
          Submit
        </button>
      </div>
      <div id='videoMedia' ref={videos}>
        <div id='localMedia' ref={localMediaEl}></div>

        <div id='remoteVideos' ref={remoteVideoEl}></div>

        <div id='remoteAudios' ref={remoteAudioEl}></div>
      </div>
    </Fragment>
  );
};

export default Room;
