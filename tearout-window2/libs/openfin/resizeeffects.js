
function registerResizeHandler(wnd, handlers, options) {
    var mouseDown = false;
    var mouseMoved = false;

    var onResize = handlers.onResize;
    var onResizeEnd = handlers.onResizeEnd;
    var onResizeStart = handlers.onResizeStart;

    var x_offset, y_offset;
    var OPTIONS = options || {};
    var THRESH = OPTIONS.thresh || 3;
    var TARGET = OPTIONS.target;

    var options_minWidth = OPTIONS.minWidth;
    var minWidth = (typeof options_minWidth == 'number'? options_minWidth : 30);

    var options_minHeight = OPTIONS.minHeight;
    var minHeight = (typeof options_minHeight == 'number'? options_minHeight : 30);

    var activeTypes = {};
    var initialWindowBounds = {};
    var anchor = "";
    var initial_x = 0;
    var initial_y = 0;

    function resetStateData() {
        activeTypes = {
            left: false,
            right: false,
            top: false,
            bottom: false
        };

        initialWindowBounds = {};
        anchor = "";
    }

    function getResizedDimensions(x, y) {
        return {
            width: Math.max(minWidth, initialWindowBounds.width + (activeTypes.right? (x - initial_x) : (activeTypes.left? (initial_x - x) : 0))),
            height: Math.max(minHeight ,initialWindowBounds.height + (activeTypes.bottom? (y - initial_y) : (activeTypes.top? (initial_y - y) : 0)))
        };
    }

    function invokeResizeHandler(handler, x, y) {
        var success = false;
        if(handler && typeof handler == 'function') {
            var dimensions = getResizedDimensions(x, y);
            handler(dimensions.width,
                dimensions.height,
                anchor,
                activeTypes);
            success = true;
        }

        return success;
    }

    wnd.addEventListener('mousedown', function (e) {
        resetStateData();
        if (e.button == 0
            /* e.target does not have class 'not-resizable' */
            && wnd.$('.not-resizable').get().indexOf(e.target) == -1
            /* if target was specified, object is contained by target or target was clicked */
            && (!TARGET || $(TARGET).has(e.target).length != 0 || $(TARGET).get(0) == e.target)
            /* e.target is not contained by an element with class 'not-resizable' */
            && wnd.$('.not-resizable').has(e.target).length == 0) {


            fin.desktop.Window.getCurrent().getBounds(function(bounds) {
                initialWindowBounds = bounds;
                x_offset = e.x;
                y_offset = e.y;

                fin.desktop.System.getMousePosition(function (evt) {
                    initial_x = parseInt(evt.left);
                    initial_y = parseInt(evt.top);

                    var eTarget = e.target;
                    var $mouseTarget = $(eTarget);

                    // Top
                    if($mouseTarget.hasClass('top-resize') || wnd.$('.top-resize').has(eTarget).length > 0) {
                        activeTypes.top = true;
                        mouseDown = true;
                        anchor = "bottom";
                        // Bottom
                    } else if(activeTypes.bottom = $mouseTarget.hasClass('bottom-resize') || wnd.$('.bottom-resize').has(eTarget).length > 0) {
                        activeTypes.bottom = true;
                        mouseDown = true;
                        anchor = "top";
                    } else {
                        anchor = "top";
                    }

                    // Left
                    if($mouseTarget.hasClass('left-resize') || wnd.$('.left-resize').has(eTarget).length > 0) {
                        activeTypes.left = true;
                        mouseDown = true;
                        anchor += "-right";
                        // Right
                    } else if($mouseTarget.hasClass('right-resize') || wnd.$('.right-resize').has(eTarget).length > 0) {
                        activeTypes.right = true;
                        mouseDown = true;
                        anchor += "-left";
                    } else {
                        anchor += "-left";
                    }
                });
            });
        }
    });

    wnd.addEventListener('mousemove', function (e) {
        if (mouseDown) {
            e.preventDefault();
            if (!mouseMoved && Math.sqrt(Math.pow((e.x - x_offset), 2) + Math.pow((e.y - y_offset), 2)) >= THRESH) {
                fin.desktop.System.getMousePosition(function (evt) {
                    invokeResizeHandler(onResizeStart, parseInt(evt.left), parseInt(evt.top));
                    mouseMoved = true;
                });
            }

            if (mouseMoved)  {
                fin.desktop.System.getMousePosition(function (evt) {
                    invokeResizeHandler(onResize, parseInt(evt.left), parseInt(evt.top));
                });
            }
        }
    });

    wnd.addEventListener('mouseup', function (e) {
        if (e.button == 0) {
            if (mouseMoved) {
                fin.desktop.System.getMousePosition(function (evt) {
                    invokeResizeHandler(onResizeEnd, parseInt(evt.left), parseInt(evt.top));
                });
            }

            mouseDown = false;
            mouseMoved = false
        }
    });
}