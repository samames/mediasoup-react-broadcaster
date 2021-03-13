if (location.href.substr(0, 5) !== 'https')
  location.href = 'https' + location.href.substr(4, location.href.length - 4)

const socket = io()


let producer = null;

nameInput.value = ''

socket.request = function request(type, data = {}) {
  return new Promise((resolve, reject) => {
    socket.emit(type, data, (data) => {
      if (data.error) {
        console.log("E: "+data.error)
        reject(data.error)
      } else {
        console.log("R: " + data)
        resolve(data)
      }
    })
  })
}

let rc = null

if (location.href.includes("?r=")) {
  let indexOfRoomNumber = location.href.indexOf("?r=")+3
  let array = location.href.split('')
  let room = array.slice(indexOfRoomNumber,indexOfRoomNumber+3).join("")
  let input = document.getElementById('roomidInput')
  input.value = room
  input.disabled = true
}

function addParams(room_id) {
  if (!window.location.href.includes(`?r=${room_id}`)) {
  history.pushState('', '', `${location.href}?r=${room_id}`)
  }
}

function joinRoom(name, room_id) {
  addParams(room_id)
     
  if (rc && rc.isOpen()) {
    console.log('already connected to a room')
  } else {
    rc = new RoomClient(localMedia, remoteVideos, remoteAudios, window.mediasoupClient, socket, room_id, name, roomOpen)
    console.log('new rc created')
    addListeners()
  }
  console.log(`Welcome to room: ${room_id}, ${name}`)
}

sendMessage = async (message) => {
  await rc.socket.request("message", message)
}

function roomOpen() {
  login.className = 'hidden'
  if (rc.creator === true) {
  reveal(startAudioButton)
  hide(stopAudioButton)
  reveal(startVideoButton)
  hide(stopVideoButton)
  reveal(startScreenButton)
  hide(stopScreenButton)
  reveal(chat)
  reveal(audioSelect)
  reveal(videoSelect)
  reveal(brControl)
  }
  reveal(exitButton)
  control.className = ''
  reveal(videoMedia)
}

function hide(elem) {
  elem.className = 'hidden'
}

function reveal(elem) {
  elem.className = ''
}


function addListeners() {
  if (rc.creator) {

  rc.on(RoomClient.EVENTS.startScreen, () => {
    hide(startScreenButton)
    reveal(stopScreenButton)
  })

  rc.on(RoomClient.EVENTS.stopScreen, () => {
    hide(stopScreenButton)
    reveal(startScreenButton)

  })

  rc.on(RoomClient.EVENTS.stopAudio, () => {
    hide(stopAudioButton)
    reveal(startAudioButton)

  })
  rc.on(RoomClient.EVENTS.startAudio, () => {
    hide(startAudioButton)
    reveal(stopAudioButton)
  })

  rc.on(RoomClient.EVENTS.startVideo, () => {
    hide(startVideoButton)
    reveal(stopVideoButton)
  })
  rc.on(RoomClient.EVENTS.stopVideo, () => {
    hide(stopVideoButton)
    reveal(startVideoButton)
  })
}
  rc.on(RoomClient.EVENTS.exitRoom, () => {
    let indexOfQuestionMark = location.href.indexOf("?")
    location.href = location.href.split('').slice(0, indexOfQuestionMark-1).join('')

    hide(control)
    reveal(login)
    hide(videoMedia)
  })
}
