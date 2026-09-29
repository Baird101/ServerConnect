var relayWindow = null;

function openRelay() {

    relayWindow = window.open(
        "relay.html",
        "serverRelay",
        "width=400,height=300"
    );

    document.getElementById("status").textContent =
        "Opening relay...";

    window.addEventListener("message", function(event) {

        if(event.data && event.data.type === "relay_ready") {

            document.getElementById("status").textContent =
                "Connected to server.";

        }

        if(event.data && event.data.type === "relay_message") {

            console.log(
                "Server:",
                event.data.data
            );

        }

    });

}