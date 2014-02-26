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

// For WindowInteropHelper
using System.Windows.Interop;

// For OpenFin
using Openfin.Desktop;

// JObject for InterApplicationBus
using Newtonsoft.Json.Linq;

namespace example_WPF_ExternalWindowObserver_snap
{
    /// <summary>
    /// Interaction logic for MainWindow.xaml
    /// </summary>
    public partial class MainWindow : System.Windows.Window, DesktopStateListener
    {
        // Manages Openfin API integration for the lifetime of this window
        Openfin.Desktop.ExternalWindowObserver externalObserver_;
        readonly string host_;
        readonly int port_;
        readonly string parentAppUuid_;
        readonly string name_;
        readonly string connectionName_;
        readonly string path_;
        readonly string args_;
        readonly string url_;
        DesktopConnection connection_;
        Openfin.Desktop.Application htmlApp_;

        // Summary:
        //     Callback when the connection with the Desktop has closed.
        public void onClosed() {
            // Handle on UI thread
            this.Dispatcher.BeginInvoke(new Action(() =>
            {
                Close();
            }));
        }

        //
        // Summary:
        //     Callback when client cannot start or connect to the Desktop.
        public void onError(string reason) { }
        //
        // Summary:
        //     Callback when a message is sent to this client.
        public void onMessage(string message) { }
        //
        // Summary:
        //     Callback when a message is sent from this client.
        public void onOutgoingMessage(string message) { }
        //
        // Summary:
        //     Callback when Desktop is successfully connected and ready to accept commands.
        public void onReady() {
            Openfin.Desktop.ApplicationOptions appOptions = new Openfin.Desktop.ApplicationOptions(parentAppUuid_, parentAppUuid_, url_);
            Openfin.Desktop.WindowOptions windowOptions = appOptions.MainWindowOptions;
            windowOptions.AutoShow = true;
            windowOptions.DefaultWidth = 310;
            windowOptions.DefaultHeight = 287;

            AckCallback afterCreate = (createAck) => {
                htmlApp_.run((runAck) => {

                    // Handle on UI thread to get the window bounds
                    this.Dispatcher.BeginInvoke(new Action(() =>
                    {
                        htmlApp_.getWindow().showAt((int)Left + (int)Width + 80, (int)Top, false);
                        htmlApp_.getWindow().setAsForeground();

                        // Subscribe to handle when this app has been registered with the HTML app
                        connection_.getInterApplicationBus().subscribe(parentAppUuid_, "csharp-registered", (sourceUuid, topic, message) =>
                        {
                            // Handle on UI thread to check externalObserver_ is not defined
                            this.Dispatcher.BeginInvoke(new Action(() =>
                            {
                                if (externalObserver_ == null)
                                {
                                    // Integrate this window
                                    externalObserver_ = new Openfin.Desktop.ExternalWindowObserver(host_,
                                                                                                   port_,
                                                                                                   parentAppUuid_,
                                                                                                   name_,
                                                                                                   new WindowInteropHelper(this).Handle);
                                }
                            }));
                        });

                        // Ensure HTML is ready before registering.
                        connection_.getInterApplicationBus().subscribe(parentAppUuid_, "html-wpf-ready", (rSourceUuid, rTopic, rMessage) =>
                        {
                            // Be on UI thread to ensure externalObserver_ is not defined
                            this.Dispatcher.BeginInvoke(new Action(() =>
                            {
                                // Notify HTML to register and prepare for docking with this C# app
                                if (externalObserver_ == null) {
                                    JObject payload = new JObject();
                                    DesktopUtils.updateJSONValue(payload, "name", name_);
                                    connection_.getInterApplicationBus().send(parentAppUuid_, "reserve-csharp-name", payload);
                                }
                            }));

                        });

                        connection_.getInterApplicationBus().send(parentAppUuid_, "wpf-html-ready", null);
                    }));
                });    
            };

            htmlApp_ = new Openfin.Desktop.Application(appOptions, connection_, afterCreate, afterCreate);
        }

        // Creates the WPF window and stores integration information.
        public MainWindow(string host, 
                          int port,
                          string path,
                          string args,
                          string connectionName,
                          string parentAppUuid, 
                          string name,
                          string url)
        {
            // Store connection & integration information
            host_ = host;
            port_ = port;
            parentAppUuid_ = parentAppUuid;
            name_ = name;
            path_ = path;
            args_ = args;
            connectionName_ = connectionName;
            url_ = url;

            // Create the connection with a unique name
            connection_ = new DesktopConnection(connectionName, host, port);
            
            // Register handler on load for registering this window with the desktop
            this.Loaded += MainWindow_Loaded; 

            InitializeComponent();
        }

        private void MainWindow_Loaded(object sender, RoutedEventArgs e)
        { 
            // HWND must be available for registering this window.

            // Attempt to launch and connect, timeout after 30 seconds. 
            // Just connect if already running.
            connection_.launchAndConnect(path_, args_, this, 30);  
        }
    }
}
