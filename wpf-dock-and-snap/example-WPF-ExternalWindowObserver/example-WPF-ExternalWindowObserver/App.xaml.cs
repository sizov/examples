using System;
using System.Collections.Generic;
using System.Configuration;
using System.Data;
using System.Linq;
using System.Windows;

namespace example_WPF_ExternalWindowObserver_snap
{
    /// <summary>
    /// Interaction logic for App.xaml
    /// </summary>
    public partial class App : Application
    {
        // Process command line arguments
        private void Application_Startup(object sender, StartupEventArgs e)
        {
            string host = "localhost";
            int port = 9696;

            // Get default installed location for runtime 2.0.3.17
            string path = (Environment.OSVersion.Version.Major > 5? 
                // Vista, Win7 or Win8
                Environment.ExpandEnvironmentVariables("%LOCALAPPDATA%") + "\\OpenFin\\runtime\\2.0.3.17\\OpenFin\\openfin.exe"
                    :
                // XP
                Environment.ExpandEnvironmentVariables("%APPDATA%") + "..\\Local Settings\\Application Data\\OpenFin\\runtime\\2.0.3.17\\OpenFin\\openfin.exe"
            );

            string args = "";
            string connectionName = "WPF-Snap-Controller";
            string parentAppUuid = "WPF-Snap-HTML";
            string name = "externalWPF";
            string htmlAppUrl = "https://developer.openfin.co/examples/external-wpf-window-dock-and-snap/index.html";
            
            // Override defaults from command line args
            switch (e.Args.Length)
            {
                // Fallthrough
                case 8:
                    htmlAppUrl = e.Args[7];
                    goto case 7;
                case 7:
                    name = e.Args[6];
                    goto case 6;
                case 6:
                    parentAppUuid = e.Args[5];
                    goto case 5;
                case 5:
                    connectionName = e.Args[4];
                    goto case 4;
                case 4:
                    args = e.Args[3];
                    goto case 3;
                case 3:
                    path = e.Args[2];
                    goto case 2;
                case 2:
                    port = Int32.Parse(e.Args[1]);
                    goto case 1;
                case 1:
                    host = e.Args[0];
                    break;
                default:
                    break;

            }

            // Create main application window
            MainWindow mainWindow = new MainWindow(host, 
                                                   port, 
                                                   path, 
                                                   args, 
                                                   connectionName, 
                                                   parentAppUuid, 
                                                   name,
                                                   htmlAppUrl);
            mainWindow.Show();
        }
    }
}
