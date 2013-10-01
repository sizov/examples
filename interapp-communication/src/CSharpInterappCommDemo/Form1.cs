using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using Openfin.Desktop;
using Newtonsoft.Json.Linq;

namespace InterAppCommDemo
{

    public partial class Form1 : System.Windows.Forms.Form, DesktopStateListener
    {

        private InterApplicationBus interAppBus_;
        private DesktopConnection controller_;
        private const string uuid_ = "csharpinterappcommdemo";
        private const string htmlDemoUuid_ = "htmlinterappcommdemo";
        private Application htmlApplication_;
        private delegate void SubscriptionCallback();
        private SubscriptionCallback subscriptionCallback = null;
        private Dictionary<string, bool> subscriptionMap;

        public Form1()
        {
            InitializeComponent();
            //setConnectButtonState("Connect", true, false);
            subscriptionMap = new Dictionary<string, bool>();
            controller_ = new DesktopConnection(uuid_, "127.0.0.1", 9696);
        }

        private void connectButton_Click(object sender, EventArgs e)
        {
            switch (connectButton.Text) { 
                case "Connect":
                    connectToDesktop();
                    break;
                case "Disconnect":
                    controller_.disconnect();
                    setConnectButtonState("Connect", true, false);
                    break;
            }
        }

        public void connectToDesktop()
        {
            setConnectButtonState("Connecting", false, false);
            controller_.connectToDesktop(System.Guid.NewGuid().ToString(), "external-authorization", this);
        }


        public void onReady()
        {
            setConnectButtonState("Disconnect", true, true);
                       
            interAppBus_ = controller_.getInterApplicationBus();
            interAppBus_.addSubscribeListener((uuid, topic) => {
                bool exists = false;

                if (!subscriptionMap.TryGetValue(topic, out exists)) {
                    subscriptionMap.Add(topic, true);
                    if (subscriptionCallback != null) 
                        subscriptionCallback();
                }
            });
            Console.WriteLine("OnReady.");
            ApplicationOptions mainAppOptions = new ApplicationOptions(htmlDemoUuid_, htmlDemoUuid_, "https://developer.openf.in/htmlinterappcommdemo/1/index.html");
            mainAppOptions.Version = "v1.0.0.0b";
            mainAppOptions.IsAdmin = true;

            WindowOptions mainWindowOptions = mainAppOptions.MainWindowOptions;
            mainWindowOptions.AutoShow = true;
            mainWindowOptions.DefaultLeft = 100;
            mainWindowOptions.DefaultTop = 100;
            mainWindowOptions.DefaultWidth = 510;
            mainWindowOptions.DefaultHeight = 350;
            mainWindowOptions.Maximizable = false;
            mainWindowOptions.ShowTaskbarIcon = true;

            AckCallback afterAppCreation = (ack) =>
            {
                Console.WriteLine("afterAppCreation");
                Console.WriteLine(ack.getJsonObject().ToString());
                AckCallback afterRun = (runAck) =>
                {
                    Console.WriteLine("afterRun");
                    Console.WriteLine(runAck.getJsonObject().ToString());
                };

                Console.WriteLine("app.run()");
                // Using same callback for success and error in case app is already running
                htmlApplication_.run(afterRun, afterRun);

            };


            // Using same callback for success and error in case app already exists
            Console.WriteLine("Creating App");
            htmlApplication_ = new Application(mainAppOptions, controller_, afterAppCreation, afterAppCreation);
            htmlApplication_.addEventListener("closed", (ack) => {
                controller_.disconnect();
                System.Windows.Forms.Application.ExitThread();
            });
        }

        /// <summary>
        ///     Callback when client cannot start or connect to the Desktop.
        /// </summary>
        public void onError(String reason)
        {
            setConnectButtonState("Connect", true, false);
            Console.WriteLine("onError onMessage: {0}", reason);
        }

        /// <summary>
        ///     Callback when a message is sent to this client.
        /// </summary>
        public void onMessage(String message)
        {
            Console.WriteLine(message);
            /* DesktopConnection received a message*/
        }

        /// <summary>
        ///     Callback when a message is sent from this client.
        /// </summary>
        public void onOutgoingMessage(String message)
        {

            Console.WriteLine(message);
            /* DesktopConnection sent out a message*/
        }


        private void setConnectButtonState(string text, bool enabled, bool sendEnabled) {
            Invoke((System.Windows.Forms.MethodInvoker) delegate
            {
                connectButton.Enabled = enabled;
                connectButton.Text = text;
                sendButton.Enabled = sendEnabled;
            });
        }

        private void sendButton_Click(object sender, EventArgs e)
        {

            
            subscriptionCallback = () =>
            {
                JObject msg = new JObject();
                JObject msg2 = new JObject();
                DesktopUtils.updateJSONValue(msg, "data", dataTextBox.Text);
                DesktopUtils.updateJSONValue(msg2, "topic", "incoming-data");
                DesktopUtils.updateJSONValue(msg2, "message", dataTextBox.Text);
                interAppBus_.send("exceladapter", "update", msg2);
                interAppBus_.send(htmlDemoUuid_, topicTextBox.Text, msg);
            };

            if (subscriptionMap.ContainsKey(topicTextBox.Text))
            {
                subscriptionCallback();
            }
            else { 
                JObject msg = new JObject();
                DesktopUtils.updateJSONValue(msg, "topic", topicTextBox.Text); 
                interAppBus_.send("htmlinterappcommdemo", "new-topic", msg);
            }
        }

        private void Form1_Load(object sender, EventArgs e)
        {

        }

    }
}
