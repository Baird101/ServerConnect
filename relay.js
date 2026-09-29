var params = new URLSearchParams(
    window.location.search
);

var action = params.get("action");
var room = params.get("room");

var statusElement =
    document.getElementById("status");

var lobbyElement =
    document.getElementById("lobby");

var socket = null;

var peer = null;
var channel = null;

var connected = false;

function setStatus(text) {

    if(statusElement) {
        statusElement.textContent = text;
    }

}

function setLobby(text) {

    if(lobbyElement) {
        lobbyElement.textContent = text;
    }

}

function notifyMain(
    peerEvent,
    detail,
    message
) {

    if(
        !window.opener ||
        window.opener.closed
    ) {
        return;
    }

    window.opener.postMessage({

        type: "relay_event",

        room: room,

        peerEvent: peerEvent,

        detail: detail || "",

        message: message || ""

    }, "*");

}

function connectSignaling() {

    setStatus(
        "Connecting to signaling server..."
    );

    setLobby(
        "Room: " + room
    );

    /*
     * This must eventually be WSS.
     *
     * For local testing with a plain WS server,
     * use ws:// instead.
     */

    socket = new WebSocket(
        "wss://217.154.36.84:6396"
    );

    socket.onopen = function() {

        setStatus(
            "Signaling connected"
        );

        setLobby(
            "Room: " +
            room +
            "\nWaiting for WebRTC peer..."
        );

        notifyMain(
            "relay_connected",
            "Signaling server connected"
        );

        sendSignal({
            type: "hello",
            room: room
        });

    };

    socket.onmessage = function(event) {

        var data;

        try {

            data = JSON.parse(
                event.data
            );

        } catch(error) {

            console.log(
                "Invalid signaling message:",
                event.data
            );

            return;
        }

        handleSignal(data);

    };

    socket.onclose = function() {

        setStatus(
            "Signaling disconnected"
        );

        connected = false;

        notifyMain(
            "relay_disconnected",
            "Signaling server disconnected"
        );

    };

    socket.onerror = function(error) {

        console.log(
            "Signaling error:",
            error
        );

        setStatus(
            "Signaling error"
        );

    };

}

function sendSignal(data) {

    if(
        !socket ||
        socket.readyState !== WebSocket.OPEN
    ) {
        return;
    }

    data.room = room;

    socket.send(
        JSON.stringify(data)
    );

}

function createPeer() {

    if(peer) {
        return;
    }

    peer = new RTCPeerConnection({

        iceServers: [

            {
                urls:
                    "stun:stun.cloudflare.com:3478"
            }

        ]

    });

    peer.onicecandidate =
        function(event) {

            if(!event.candidate) {
                return;
            }

            sendSignal({

                type: "ice",

                candidate:
                    event.candidate

            });

        };

    peer.onconnectionstatechange =
        function() {

            console.log(
                "WebRTC state:",
                peer.connectionState
            );

            if(
                peer.connectionState ===
                "connected"
            ) {

                connected = true;

                setStatus(
                    "WEBRTC CONNECTED!"
                );

                setLobby(
                    "Room: " +
                    room +
                    "\nWebRTC connection established."
                );

                notifyMain(
                    "webrtc_connected",
                    "WebRTC connection established"
                );

            }

            if(
                peer.connectionState ===
                "disconnected" ||
                peer.connectionState ===
                "failed" ||
                peer.connectionState ===
                "closed"
            ) {

                connected = false;

                setStatus(
                    "WEBRTC DISCONNECTED"
                );

                notifyMain(
                    "webrtc_disconnected",
                    "WebRTC connection closed"
                );

            }

        };

    peer.ondatachannel =
        function(event) {

            channel = event.channel;

            setupChannel();

        };

}

function setupChannel() {

    if(!channel) {
        return;
    }

    channel.onopen = function() {

        console.log(
            "DataChannel opened"
        );

        setStatus(
            "WEBRTC CONNECTED!"
        );

        notifyMain(
            "webrtc_connected",
            "DataChannel opened"
        );

    };

    channel.onmessage =
        function(event) {

            console.log(
                "Received:",
                event.data
            );

            notifyMain(
                "webrtc_message",
                "",
                event.data
            );

        };

    channel.onclose = function() {

        console.log(
            "DataChannel closed"
        );

        notifyMain(
            "webrtc_disconnected",
            "DataChannel closed"
        );

    };

}

function createOffer() {

    createPeer();

    channel =
        peer.createDataChannel(
            "relay"
        );

    setupChannel();

    peer.createOffer()

        .then(function(offer) {

            return peer.setLocalDescription(
                offer
            );

        })

        .then(function() {

            sendSignal({

                type: "offer",

                sdp:
                    peer.localDescription.sdp

            });

        })

        .catch(function(error) {

            console.log(
                "Offer error:",
                error
            );

        });

}

function handleOffer(data) {

    createPeer();

    peer.setRemoteDescription({

        type: "offer",

        sdp: data.sdp

    })

    .then(function() {

        return peer.createAnswer();

    })

    .then(function(answer) {

        return peer.setLocalDescription(
            answer
        );

    })

    .then(function() {

        sendSignal({

            type: "answer",

            sdp:
                peer.localDescription.sdp

        });

    })

    .catch(function(error) {

        console.log(
            "Offer handling error:",
            error
        );

    });

}

function handleAnswer(data) {

    if(!peer) {
        return;
    }

    peer.setRemoteDescription({

        type: "answer",

        sdp: data.sdp

    })

    .catch(function(error) {

        console.log(
            "Answer error:",
            error
        );

    });

}

function handleIce(data) {

    if(!peer || !data.candidate) {
        return;
    }

    peer.addIceCandidate(
        data.candidate
    )

    .catch(function(error) {

        console.log(
            "ICE error:",
            error
        );

    });

}

function handleSignal(data) {

    if(data.room !== room) {
        return;
    }

    if(data.type === "offer") {

        handleOffer(data);

        return;

    }

    if(data.type === "answer") {

        handleAnswer(data);

        return;

    }

    if(data.type === "ice") {

        handleIce(data);

        return;

    }

    if(data.type === "peer_joined") {

        setLobby(
            "Room: " +
            room +
            "\nPeer joined."
        );

        if(action === "create") {

            createOffer();

        }

        return;

    }

}

window.addEventListener(
    "message",
    function(event) {

        var data = event.data;

        if(!data) {
            return;
        }

        if(data.type === "send_webrtc") {

            if(
                channel &&
                channel.readyState === "open"
            ) {

                channel.send(
                    data.message
                );

            }

        }

    }
);

var parentCheckTimer =
    setInterval(function() {

        if(
            !window.opener ||
            window.opener.closed
        ) {

            clearInterval(
                parentCheckTimer
            );

            if(socket) {

                try {
                    socket.close();
                } catch(error) {}

            }

            if(peer) {

                try {
                    peer.close();
                } catch(error) {}

            }

            try {
                window.close();
            } catch(error) {}

        }

    }, 250);

if(!action || !room) {

    setStatus(
        "Missing parameters."
    );

    setLobby(
        "Missing action or room."
    );

} else {

    connectSignaling();

}