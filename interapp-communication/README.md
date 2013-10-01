
# Interapp Communication Demo

In this demo, a C# application, an HTML application, and an Excel spreadsheet share data via the InterApplicationBus and
the App Desktop Excel Adapter. 

### To send a message from C# to HTML

C#:
```java
InterApplicationBus interAppBus = desktopConnection.getInterApplicationBus();

JObject htmlAppMessage = new JObject();
DesktopUtils.updateJSONValue(htmlAppMessage, "data", "some message");

interAppBus_.send("htmlinterappcommdemo", "some topic", htmlAppMessage);
```

HTML:

```javascript
fin.desktop.InterApplicationBus.subscribe("csharpinterappcommdemo", function (msg) {
	console.log(msg.data);
});
```

### To send a message from C# to Excel

C#:
```java
InterApplicationBus interAppBus = desktopConnection.getInterApplicationBus();

JObject excelMessage = new JObject();
DesktopUtils.updateJSONValue(excelMessage, "topic", "incoming-data");
DesktopUtils.updateJSONValue(excelMessage, "message", "a message");

interAppBus.send("exceladapter", "update", excelMessage);
```

Excel
```
=OFS("csharpinterappcommdemo", "incoming-data");
```
