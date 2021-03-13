import { useState } from 'react';
import { useHistory } from 'react-router-dom';

const Splash = () => {
  const [name, setName] = useState('Donalod Trump');
  const [room, setRoom] = useState('White House');
  const history = useHistory();

  const handleSubmit = (e) => {
    setName();
    history.push(`/room/${room}/user/${name}`);
  };
  return (
    <form onSubmit={handleSubmit}>
      <label>Name your broadcast:</label>{' '}
      <input
        id='roomidInput'
        placeholder={room}
        onChange={(e) => setRoom(e.target.value)}
        type='text'
      />
      <label>Broadcast yourself:</label>{' '}
      <input
        id='nameInput'
        placeholder={name}
        onChange={(e) => setName(e.target.value)}
        type='text'
      />
      <button id='joinButton' type='submit'>
        Go live!
      </button>
    </form>
  );
};

export default Splash;
