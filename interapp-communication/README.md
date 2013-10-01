
# Interapp Communication Demo

In this demo, a C# application, an HTML application, and an Excel spreadsheet share data via the InterApplicationBus and
the App Desktop Excel Adapter. 

To send a message from C# to HTML

```csharp
JObject htmlAppMessage = new JObject();
DesktopUtils.updateJSONValue(htmlAppMessage, "data", dataTextBox.Text);
interAppBus_.send("htmlinterappcommdemo", topicTextBox.Text, msg);

JObject excelMessage = new JObject();
DesktopUtils.updateJSONValue(excelMessage, "topic", "incoming-data");
DesktopUtils.updateJSONValue(excelMessage, "message", dataTextBox.Text);
interAppBus_.send("exceladapter", "update", excelMessage);
```

To send a message from C# to Excel

```csharp
```

The WHATWG defines a new element called `<dialog>` that can be used to define modal and modeless dialogs within an HTML page. This example shows how to use this new element.



```javascript
var dialog = document.querySelector('#dialog1');
document.querySelector('#show').addEventListener("click", function(evt) {
  dialog.showModal();
});
document.querySelector('#close').addEventListener("click", function(evt) {
  dialog.close("thanks!");
});

dialog.addEventListener("close", function(evt) {
  document.querySelector('#result').textContent = "You closed the dialog with: " + dialog.returnValue;
});

// called when the user Cancels the dialog, for example by hitting the ESC key
dialog.addEventListener("cancel", function(evt) {
  dialog.close("canceled");
});
```

## Resources

* [Runtime](http://developer.chrome.com/trunk/apps/app.runtime.html)
* [Window](http://developer.chrome.com/trunk/apps/app.window.html)
     
