using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Navigation;
using System.Windows.Shapes;
using Openfin.Desktop;
using Newtonsoft.Json.Linq;
namespace InterApplicationBus_Example
{
    /// <summary>
    /// Interaction logic for MainWindow.xaml
    /// </summary>
    public partial class MainWindow : System.Windows.Window, DesktopStateListener
    {
        /// <summary>
        ///     Encapsulates a websocket connection with the OpenFin Desktop.
        /// </summary>
        private DesktopConnection connection_;
        
        /// <summary>
        ///     The HTML application to communicate with using the InterApplicationBus
        /// </summary>
        private Openfin.Desktop.Application htmlApp_;

        private string receiverUuid_ = "interapp-html-receiver";
        /// <summary>
        ///     Creates the WPF window and establishes a websocket connection.
        /// </summary>
        public MainWindow()
        {
            InitializeComponent();

            // Create and connect
            connection_ = new DesktopConnection("C# InterApplicationBus Example", "localhost", 9696);
            connection_.connect(this);
        }

        /// <summary>
        ///     Sends a message using the InterApplicationBus
        /// </summary>
        public void SendMessage(object sender, RoutedEventArgs e)
        {
            // Create JSON payload containing the user input text
            JObject messagePayload = new JObject();
            DesktopUtils.updateJSONValue(messagePayload, "data", ResponseTextBox.Text);

            // Send to HTML application
            connection_.getInterApplicationBus().send(receiverUuid_, "show-message", messagePayload);
        }

        /// <summary>
        ///     Move the HTML window up 10 pixels
        /// </summary>
        public void MoveWindowUp(object sender, RoutedEventArgs e)
        {
            if (htmlApp_ != null)
            {
                htmlApp_.getWindow().moveBy(0, -10);
            }
        }

        /// <summary>
        ///     Move the HTML window left 10 pixels
        /// </summary>
        public void MoveWindowLeft(object sender, RoutedEventArgs e)
        {
            if (htmlApp_ != null)
            {
                htmlApp_.getWindow().moveBy(-10, 0);
            }
        }

        /// <summary>
        ///     Move the HTML window right 10 pixels
        /// </summary>
        public void MoveWindowDown(object sender, RoutedEventArgs e)
        {
            if (htmlApp_ != null)
            {
                htmlApp_.getWindow().moveBy(0, 10);
            }
        }

        /// <summary>
        ///     Move the HTML window down 10 pixels
        /// </summary>
        public void MoveWindowRight(object sender, RoutedEventArgs e)
        {
            if (htmlApp_ != null)
            {
                htmlApp_.getWindow().moveBy(10, 0);
            }
        }

        // DesktopStateListener methods
        public void onClosed() { }
        public void onError(string reason) { }
        public void onMessage(string message) { }
        public void onOutgoingMessage(string message) { }

        /// <summary>
        ///     Called after the websocket connection has been established
        /// </summary>
        public void onReady()
        {
            // Run on UI thread
            this.Dispatcher.Invoke(new Action(() => {
                // Default some options for the application and its main window
                ApplicationOptions options = new ApplicationOptions(receiverUuid_,
                                                                    receiverUuid_, 
                                                                    "https://demoappdirectory.openf.in/desktop/examples/interapp-receiver/index.html");
                options.MainWindowOptions.AutoShow = true;
                options.MainWindowOptions.DefaultWidth = 800;
                options.MainWindowOptions.DefaultHeight = 600;

                // Create and run the HTML application
                htmlApp_ = new Openfin.Desktop.Application(options, connection_);

                // Setting delegate on error callback as well. 
                // handles the case where the application is already running.
                htmlApp_.run(afterRun, afterRun);
            }));
        }

        /// <summary>
        ///     Triggered after the application has run.
        /// </summary>
        /// <param name="result">The result from the OpenFin Desktop</param>
        private void afterRun(Ack result)
        {
            htmlApp_.getWindow().show();
        }
    }
}
