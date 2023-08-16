import React, { useContext, useEffect, useMemo, useState } from 'react'
import { parseLinkHeader } from '@web3-storage/parse-link-header'
import { useLocation, useParams } from 'react-router-dom'
import useRoom from '../../room';
import { useAccount } from '../../account';

export const CinemaModeContext = React.createContext(null);

export function CinemaModeProvider({ children }) {
  const [cinemaMode, setCinemaMode] = useState(() => localStorage.getItem("cinema-mode") === "true");
  const state = useMemo(() => ({
    cinemaMode,
    setCinemaMode,
    toggleCinemaMode: () => setCinemaMode((prev) => !prev),
  }), [cinemaMode, setCinemaMode]);

  useEffect(() => localStorage.setItem("cinema-mode", cinemaMode), [cinemaMode]);
  return (
    <CinemaModeContext.Provider value={state}>
      {children}
    </CinemaModeContext.Provider>
  );
}

function PlayerPage() {
  const { roomId } = useParams()
  const room = useRoom(roomId)
  const { cinemaMode, toggleCinemaMode } = useContext(CinemaModeContext);
  return (
    <div className={`flex flex-col items-center ${!cinemaMode && 'mx-auto px-2 py-2 container'}`}>
      <Streams streamers={room.users.filter((user) => user.streaming)} />
      <OnlineUsers users={room.users} />
      <button className='bg-blue-900 px-4 py-2 rounded-lg mt-6' onClick={toggleCinemaMode}>
        {cinemaMode ? "Disable cinema mode" : "Enable cinema mode"}
      </button>
    </div>
  )
}

function Streams({ streamers }) {
  const account = useAccount()
  return (
    <>
      {streamers.map((streamer) => ( // todo: sort
        <React.Fragment key={streamer.id}>
          <p className='text-lg'>{streamer.id} user video:</p>
          <Player key={streamer.id} account={account} streamer={streamer} />
        </React.Fragment>
      ))}
    </>
  )
}

function Player({ account, streamer, cinemaMode }) {
  const videoRef = React.createRef()
  const location = useLocation()
  const [videoLayers, setVideoLayers] = React.useState([]);
  const [mediaSrcObject, setMediaSrcObject] = React.useState(null);
  const [layerEndpoint, setLayerEndpoint] = React.useState('');

  const onLayerChange = event => {
    fetch(layerEndpoint, {
      method: 'POST',
      body: JSON.stringify({ mediaId: '1', encodingId: event.target.value }),
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }

  React.useEffect(() => {
    if (videoRef.current) {
      console.log("video ref changed");
      videoRef.current.srcObject = mediaSrcObject
    }
  }, [mediaSrcObject, videoRef.current])

  React.useEffect(() => {
    const peerConnection = new RTCPeerConnection() // eslint-disable-line

    peerConnection.ontrack = function (event) {
      setMediaSrcObject(event.streams[0])
    }

    peerConnection.addTransceiver('audio', { direction: 'recvonly' })
    peerConnection.addTransceiver('video', { direction: 'recvonly' })

    peerConnection.createOffer().then(offer => {
      peerConnection.setLocalDescription(offer)

      fetch(`${process.env.REACT_APP_API_PATH}/whep/${encodeURIComponent(streamer.id)}`, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ` + account.token,
          'Content-Type': 'application/sdp'
        }
      }).then(r => {
        const parsedLinkHeader = parseLinkHeader(r.headers.get('Link'))
        setLayerEndpoint(`${window.location.protocol}//${parsedLinkHeader['urn:ietf:params:whep:ext:core:layer'].url}`)

        // const evtSource = new EventSource(`${window.location.protocol}//${parsedLinkHeader['urn:ietf:params:whep:ext:core:server-sent-events'].url}`)
        // evtSource.onerror = err => evtSource.close();

        // evtSource.addEventListener("layers", event => {
        //   const parsed = JSON.parse(event.data)
        //   setVideoLayers(parsed['1']['layers'].map(l => l.encodingId))
        // })

        return r.text()
      }).then(answer => {
        peerConnection.setRemoteDescription({
          sdp: answer,
          type: 'answer'
        })
      })
    })

    return function cleanup() {
      peerConnection.close()
    }
  }, [location.pathname, account.token, streamer.id])

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        muted
        controls
        playsInline
        className={`bg-black w-full ${cinemaMode && "min-h-screen"}`}
      />

      {videoLayers.length >= 2 &&
        <select defaultValue="disabled" onChange={onLayerChange} className="appearance-none border w-full py-2 px-3 leading-tight focus:outline-none focus:shadow-outline bg-gray-700 border-gray-700 text-white rounded shadow-md placeholder-gray-200">
          <option value="disabled" disabled={true}>Choose Quality Level</option>
          {videoLayers.map(layer => {
            return <option key={layer} value={layer}>{layer}</option>
          })}
        </select>
      }
    </>
  )
}

function OnlineUsers({ users }) {
  return (
    <>
      <p className="text-xl mt-5">Users in room: {users.length}</p>

      {users.map((user) => (
        <User key={user.id} user={user} />
      ))}
    </>
  )
}

function User({ user }) {
  return (
    <>
      <h2>User: {user.id}</h2>
    </>
  )
}

export default PlayerPage
