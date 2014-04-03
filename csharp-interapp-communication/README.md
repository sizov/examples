This example demonstrates communicating messages between C# WPF and an HTML application in the OpenFin App Desktop using the InterApplicationBus. 

The C# application assumes the App Desktop is already running on the default port of 9696 and creates an Openfin.Desktop.Application of the HTML interapp-receiver located at <https://demoappdirectory.openf.in/desktop/examples/interapp-receiver/index.html/>

The HTML window can be moved by pressing the directional buttons in the WPF application. 
Enter text into the WPF window and press the "send" button to dispatch an InterApplicationBus message from C# to JavaScript.

