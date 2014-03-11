function registerDragHandler(wnd, handlers, options) {
    var mouseDown = false;
    var mouseMoved = false;

    var onDrag = handlers.onDrag,
        onDragEnd = handlers.onDragEnd,
        onDragStart = handlers.onDragStart;

    var x_offset, y_offset;
    var OPTIONS = options || {};
    var THRESH = OPTIONS.thresh || 3;
    var TARGET = OPTIONS.target;

    wnd.addEventListener('mousedown', function (e) {
        console.log($(TARGET).has(e.target));
        if (e.button == 0
            && wnd.$('.not-draggable').get().indexOf(e.target) == -1
            && (!TARGET || $(TARGET).has(e.target).length != 0 || $(TARGET).get(0) == e.target)
            && wnd.$('.not-draggable').has(e.target).length == 0) {
            mouseDown = true;
            x_offset = e.x;
            y_offset = e.y;
        }
    });


    wnd.addEventListener('mousemove', function (e) {
        if (mouseDown) {
            e.preventDefault();
            if (!mouseMoved && Math.sqrt(Math.pow((e.x - x_offset), 2) + Math.pow((e.y - y_offset), 2)) >= THRESH) {
                mouseMoved = true;
                fin.desktop.System.getMousePosition(function (evt) {
                    var y = parseInt(evt.top);
                    var x = parseInt(evt.left);

                    if (onDragStart) onDragStart(x-x_offset, y-y_offset);
                });
            }

            if (mouseMoved)  {
                fin.desktop.System.getMousePosition(function (evt) {
                    var y = parseInt(evt.top);
                    var x = parseInt(evt.left);

                    if (onDrag) onDrag(x-x_offset, y-y_offset);
                });
            }
        }
    });


    wnd.addEventListener('mouseup', function (e) {
        if (e.button == 0) {
            if (mouseMoved) {
                fin.desktop.System.getMousePosition(function (evt) {
                    var y = parseInt(evt.top);
                    var x = parseInt(evt.left);


                    if (onDragEnd) onDragEnd(x-x_offset,y-y_offset);
                });
            }

            mouseDown = false;
            mouseMoved = false
        }
    });
}
