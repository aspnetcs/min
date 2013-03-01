var EditorState = 
    {
        // select tool states
        "ReadyToStrokeSelect" : 0,
        "StrokeSelecting" : 1,
        "ReadyToRectangleSelect" : 2,
        "RectangleSelecting" : 3,
        
        // pen states
        "ReadyToStroke" : 4, 
        "MiddleOfStroke" : 5,

        // text tool states
        "ReadyForText" : 6,
        "MiddleOfText" : 7,

        // Segment (and primitive) selection, labeling
        "SegmentsSelected" : 8,
        "MovingSegments" : 9,
        "Resizing" : 10,
        "Relabeling" : 11,
        "PinchResizing": 12,

        // Editing text box.
        "InTextBox" : 13,

        // New: moving a symbol in edit mode; touch and hold state.
        "PenMovingSegments" : 14
    };

var TouchAndHoldState = {
    "NoTouchAndHold": 0,
    "MouseDownAndStationary": 1,
    "FingerDownAndStationary": 2 // same as the above state, but happening on a touchscreen
};

Editor.lastEvent = null;
Editor.moveQueue = null;
Editor.touchAndHoldFlag = TouchAndHoldState.NoTouchAndHold;
Editor.touchAndHoldTimeout = 800;
Editor.minTouchTimeDiff = 100;

Editor.setup_events = function()
{
    var button_index = 0; // Sets default initial state (pen/touch entry)
    Editor.timeStamp = null;
    Editor.prevTimeStamp = null;
    
    PermEvents.setup_window();

    PermEvents.setup_canvas();
    PermEvents.setup_toolbar();
    PermEvents.setup_document();
    
    // Adds highlighting on pressing buttons and pinch-resize functionality
    if(Editor.using_ipad){
        PermEvents.setup_touch_events();
        SelectionMode.setup_touch_events();
    }
   
    // Select the pen tool
    Editor.button_states[Buttons.Pen].enabled = true;

}

Editor.setCursor = function ()
{
    var canvas = document.getElementById("equation_canvas");

    switch (Editor.state) 
    {
    case EditorState.StrokeSelecting:
    case EditorState.ReadyToStrokeSelect:
        canvas.style.cursor = "crosshair";
        break;
    default:
        canvas.style.cursor = "default";
        break;
    }
}


Editor.setStrokeView = function()
{
    var show = true;
    for (var i=0; i < Editor.segments.length; i++) {
        var nextSegment = Editor.segments[i];
        if (nextSegment.chalk_layer) {
            if (!show){
                nextSegment.inner_svg.setAttribute("style", "fill:none;stroke-linecap:round;");
                nextSegment.element.style.visibility = "hidden";
            }
            else{
                nextSegment.inner_svg.setAttribute("style", "fill:none;stroke-linecap:round;");
                nextSegment.element.style.visibility = "visible";                
            }
        }
    }
}

Editor.fit_to_screen = function(event)
{
    var root_div = document.getElementById("equation_editor_root");
    root_div.style.width = window.innerWidth + "px";
    root_div.style.height = window.innerHeight + "px";
    
    Editor.canvas_width = Editor.canvas_div.offsetWidth;
    Editor.canvas_height = Editor.canvas_div.offsetHeight;
    
    Editor.div_position = findPosition(Editor.canvas_div);
    
    window.scroll(0,0);
}



//--------------------------------------------------
// 
// User Input Events
//   - touchAndHold (called using timeout)
//   - onDoubleClick (called on touchAndHold as well)
//
//   - onMouseDown
//   - onMouseMove
//   - onMouseUp
//   - onKeyPress
//-------------------------------------------------- 
Editor.touchAndHold = function(e)
{
    // Only execute if we haven't moved, and haven't raised our finger/mouse.
    if (Editor.lastEvent == e && Editor.lastEvent != null) {
        Editor.touchAndHoldFlag = TouchAndHoldState.MouseDownAndStationary;
        console.log("Touch and hold");
        Editor.onDoubleClick(e);
    }
}


Editor.onDoubleClick = function(e)
{
    switch (Editor.state)
    {
    case EditorState.PenMovingSegments:
    case EditorState.ReadyToStroke:
        // DEBUG: we have to re-detect the selection for double click vs. touch-and-hold.
        if (Editor.touchAndHoldFlag == TouchAndHoldState.NoTouchAndHold) {
            var click_result = CollisionManager.get_point_collides_bb(Editor.mouse_position);
            if(click_result.length == 0)
                break;

            var segment = click_result.pop();
            for(var k = 0; k < Editor.segments.length; k++)
                if(Editor.segments[k].set_id == segment.set_id)
                    Editor.add_selected_segment(Editor.segments[k]);
        }

        RenderManager.colorOCRbbs(false);
        RenderManager.bounding_box.style.visibility = "visible";
        Editor.state = EditorState.SegmentsSelected;
        Editor.relabel(EditorState.ReadyToStroke);
        break;

    case EditorState.MovingSegments:
    case EditorState.SegmentsSelected:
        // RLAZ: allow relabeling and resegmenting using double tap.
        // Check for identical segment identifiers (relabel in that case)
        var singleObject = 0;
        if (Editor.selected_segments.length > 0) {
            var allSame = 1;
            var segmentId = Editor.selected_segments[0].set_id;

            // All selected objects belong to the same segment (id)
            for(var i = 1; i < Editor.selected_segments.length; i++) {
                if (Editor.selected_segments[i].set_id != segmentId ) {
                    allSame = 0;
                }
            }
            // All objects in the segmented have been selected.
            if (allSame > 0) {
                var totalInSegment = 0;
                for(var i = 0; i < Editor.segments.length; i++)
                {
                    if (Editor.segments[i].set_id == segmentId) {
                        totalInSegment++;
                    }
                }
                if(totalInSegment == Editor.selected_segments.length) {
                    singleObject = 1;
                }
            }
        }

        // Depending on selection, relabel or re-segment.
        var prev_state;
        if(Editor.selection_method == "Stroke")
            prev_state = EditorState.StrokeSelecting;
        else
            prev_state = EditorState.RectangleSelecting;
        
        Editor.state = EditorState.SegmentsSelected;
        if (singleObject > 0) {
            Editor.relabel(prev_state);
        } else {
            Editor.groupTool();
        }
        break;
    }
}

Editor.onMouseDown = function(e)
{
    // TODO: REMOVE THIS BOILERPLATE
    console.log(e.type);
    console.log("Editor state: " + Editor.state);
    var tmpLast = Editor.lastEvent;
    Editor.lastEvent = e;
    if (Editor.touchAndHoldFlag == TouchAndHoldState.MouseDownAndStationary && Editor.using_ipad) {
        Editor.touchAndHoldFlag = TouchAndHoldState.FingerDownAndStationary;
        return;
    }
    else {
        Editor.touchAndHoldFlag = TouchAndHoldState.NoTouchAndHold; 
    }

    // support for both computer mouse and tablet devices
    // gets the mouse position and states
    if(e.type == "mousedown" && ! Editor.using_ipad)
    {
        // we only care about left click
        if(e.button == 0)
        {
            Editor.mouse_position_prev = Editor.mouse_position;
            Editor.mouse_position = new Vector2(e.pageX - Editor.div_position[0], e.pageY - Editor.div_position[1]);
        }
        else return;
    }    
    else if(e.type == "touchstart")
    {
        // Don't do anything if a hammer event is firing or there are two many fingers on the screen
        if(Editor.state == EditorState.PinchResizing || e.touches.length > 1 || e.timeStamp - tmpLast.timeStamp < Editor.minTouchTimeDiff ){
            return;
        }
        var first = event.changedTouches[0];
        Editor.mouse_position_prev = Editor.mouse_position;
        Editor.mouse_position = new Vector2(first.pageX - Editor.div_position[0], first.pageY - Editor.div_position[1]);
    }
    else 
        return;
    
    // CMS: This is needed so that the segment doesn't "get stuck" to the mouse
    // TODO: See if there is a way to do the same thing from information 
    // in the event object
    Editor.mouse1_down = true;
    // END BOILERPLATE

    switch(Editor.state)
    {
    case EditorState.ReadyToStrokeSelect:
        StrokeSelectMode.onMouseDown(e);
        break;        
    case EditorState.ReadyToRectangleSelect:
        RectSelectMode.onMouseDown(e);
        break;

    case EditorState.SegmentsSelected:
        SelectionMode.mouseDownSegmentsSelected(e);        
        break;

    case EditorState.MiddleOfText:
        DrawMode.stopTextInput(e);
        break;

    case EditorState.ReadyForText:
        // This is set only from typeTool() which is only called
        // from one place. The state is immediately set to something else after the call.
        // This code can never run unless a mouseDown were to fire during a keypress so I think it can be removed.
        Editor.current_text = null;
        var clicked_points = CollisionManager.get_point_collides(Editor.mouse_position);
        for(var k = 0; k < clicked_points.length; k++)
        {
            if(clicked_points[k].type_id == SymbolSegment.type_id)
            {
                Editor.current_text = clicked_points[k];
                break;
            }
        }
        
        if(Editor.current_text == null)
        {
            var s = new SymbolSegment(Editor.mouse_position);
            Editor.current_text = s;
        } else {
            Editor.add_action(new EditText(Editor.current_text));
        }
        Editor.state = EditorState.MiddleOfText;
        break;


    case EditorState.ReadyToStroke:
        DrawMode.onMouseDown(e);
        break;

    }
}


Editor.onMouseMove = function(e)
{    
    // TODO: Remove Boilerplate
    Editor.lastEvent = e;

    if (Editor.touchAndHoldFlag == TouchAndHoldState.MouseDownAndStationary)
        return;

    // support for both IPad and Mouse
    if(e.type == "mousemove")
    {
        Editor.mouse_position_prev = Editor.mouse_position;
        Editor.mouse_position = new Vector2(e.pageX - Editor.div_position[0], e.pageY - Editor.div_position[1]);
        Editor.mouse_move_distance = Vector2.Distance(Editor.mouse_position, Editor.mouse_position_prev);
    }    
    else if(e.type == "touchmove")
    {
        var first = event.changedTouches[0];
        Editor.mouse_position_prev = Editor.mouse_position;
        Editor.mouse_position = new Vector2(first.pageX - Editor.div_position[0], first.pageY - Editor.div_position[1]);
        Editor.mouse_move_distance = Vector2.Distance(Editor.mouse_position, Editor.mouse_position_prev);
    }
    else 
        return;
    
    // END BOILERPLATE
    
    if(Editor.mouse1_down == true)
    {
        switch(Editor.state)
        {
        case EditorState.ReadyToStrokeSelect:
            // we don't care here
            // CMS: This should never happen
            break;
        case EditorState.StrokeSelecting:
            StrokeSelectMode.onMouseMove(e);
            break;
        case EditorState.RectangleSelecting:
            RectSelectMode.onMouseMove(e);
            break;
        case EditorState.SegmentsSelected:
            /* Initialize the moveQueue
             This should ultimately be moved to Editor.SelectionMode.
             Needs to be run on only the first mousemove event
             Only runs when the mouse is clicked to select then moved
             with no mouseUp between the click and move, otherwise 
             initialized in SelectionMode.mouseDownSegmentsSelected.
            */
            Editor.state = EditorState.MovingSegments;
            Editor.moveQueue = new BoundedQueue(Editor.moveQueueLength);
            Editor.moveQueue.enqueue(new Vector2(e, Editor.mouse_position.clone()));
        case EditorState.PenMovingSegments:
        case EditorState.MovingSegments:
            SelectionMode.moveSegmentsFromMouseMove(e);
            break;            
        case EditorState.MiddleOfStroke:
            DrawMode.onMouseMove(e);
            break;
        case EditorState.Resizing:
            var offset = Vector2.Subtract(Editor.mouse_position, Editor.mouse_position_prev);
            var bb = Editor.original_bb;
            var anchor;
            
            switch(Editor.grabbed_edge)
            {
                // top edge
            case 0:
                offset.x = 0.0;
                offset.y *= -1.0;
                anchor = new Vector2(bb.mins.x, bb.maxs.y);
                break;
                // top right corner
            case 1:
                offset.y *= -1.0;
                anchor = new Vector2(bb.mins.x, bb.maxs.y);
                break;
                // right edge
            case 2:
                offset.y = 0.0;
                anchor = bb.mins;
                break;
                // bottom right corner
            case 3:
                anchor = bb.mins;
                break;
                // bottom edge
            case 4:
                anchor = new Vector2(bb.maxs.x, bb.mins.y);
                offset.x = 0.0;
                break;
                // bottom left corner
            case 5:
                anchor = new Vector2(bb.maxs.x, bb.mins.y);
                offset.x *= -1.0;
                break;
                // left edge
            case 6:
                anchor = bb.maxs
                offset.x *= -1.0;
                offset.y = 0.0;
                break;
                // top left corner
            case 7:
                offset.x *= -1.0;
                offset.y *= -1.0;
                anchor = bb.maxs
                break; 
            }
            Editor.resize_offset.Add(offset);
            var bb_size = Vector2.Subtract(bb.maxs, bb.mins);
            
            var scale = new Vector2((Editor.resize_offset.x / bb_size.x) + 1.0, (Editor.resize_offset.y / bb_size.y) + 1.0);
            
            if((isNaN(scale.x) || isNaN(scale.y)) == false && (scale.x == 0.0 || scale.y == 0) == false)
            {
                for(var k = 0; k < Editor.selected_segments.length; k++)
                    Editor.selected_segments[k].resize(anchor, scale);
                Editor.update_selected_bb();
                RenderManager.render();
            }
            break;
            
        }
    }
}

Editor.onMouseUp = function(e)
{
    var tmpLast = Editor.lastEvent;
    Editor.lastEvent = e;
    // Don't react if we're in the middle of a transform, or if
    // there's still something touching the screen
    if(Editor.state == EditorState.PinchResizing || e.timeStamp - tmpLast.timeStamp < 0)
        return;

    if(e.button == 0 && !Editor.using_ipad || e.type == "touchend")
    {
        Editor.mouse1_down = false;

        // For touch-and-hold: reset state and return.
        console.log("MOUSE UP - FLAG:");
        console.log(e.type);
        console.log(Editor.touchAndHoldFlag);
        if (Editor.touchAndHoldFlag == TouchAndHoldState.MouseDownAndStationary) {
            return;
        }
        
        switch(Editor.state)
        {
        case EditorState.StrokeSelecting:
            if(Editor.selected_segments.length > 0)
                Editor.state = EditorState.SegmentsSelected;
            else
                Editor.state = EditorState.ReadyToStrokeSelect;
            RenderManager.clear_canvas();
            break;
        case EditorState.RectangleSelecting:
            if(Editor.selected_segments.length > 0)
                Editor.state = EditorState.SegmentsSelected;
            else
                Editor.state = EditorState.ReadyToRectangleSelect;
            Editor.start_rect_selection = Editor.end_rect_selection = null;
            RenderManager.render();
            break;
        case EditorState.PenMovingSegments:
        case EditorState.MovingSegments:
            // RLAZ: delete strokes if cursor moves out of the window.
            var canvasDims = document.getElementById('equation_canvas').getBoundingClientRect();
            var toolbarDims = document.getElementById('toolbar').getBoundingClientRect();

            var theEvent = e;
            var offSet = 10;
            if(e.type == "touchend") {
                theEvent = event.changedTouches[0];
            }

            /*
              This momentum code is adapted from code at http://jsfiddle.net/529KH/

              The license information on jsfiddle is as follows:
              Created and maintained by Piotr and Oskar.

              Hosted by DigitalOcean.

              It wouldn't exist without MooTools community.

              License

              All code belongs to the poster and no license is enforced.

              We are not responsible or liable for any loss or damage of any kind during the usage of provided code.
             */
            
            // Continue moving if there is momentum
	    var recent = Editor.moveQueue.slice(-1)[0];
	    var oldest = Editor.moveQueue.slice(0, 1)[0]
	    var recent_pos = recent.y;
	    var oldest_pos = oldest.y; 
	    var recent_ts = recent.x.timeStamp;
	    var oldest_ts = oldest.x.timeStamp;
            var delta_T = recent_ts - oldest_ts;
            
            var deltas = Vector2.Subtract(recent_pos, oldest_pos);
            var distance = Vector2.Distance(recent_pos, oldest_pos);
            // velocity in each dimension
            var velocity = new Vector2(Math.max(Math.min(deltas.x/delta_T, 1), -1),
                                       Math.max(Math.min(deltas.y/delta_T, 1), -1));
            var duration = Math.max(velocity.x, velocity.y) * 2000;
            velocity = Vector2.Multiply(10, velocity);

            console.log("velocity outside: " + velocity);
            var box_momentum = function(step, duration, velocity, position, lastStepTime){
                if(duration < 0 || step < 0)
                    return;

                var now = new Date();
                var stepDuration = now.getTime() - lastStepTime.getTime();
                var new_velocity = Vector2.Multiply(step * 1/10, velocity);

                var new_pos = Vector2.Add(position, Vector2.Multiply(stepDuration/4, velocity));
                
                SelectionMode.moveSegments(position, new_pos);
                Editor.current_action.add_new_transforms(Editor.selected_segments);
                RenderManager.render();
                
                if(new_pos.x > Editor.canvas_width || new_pos.x < 0
                   || new_pos.y > Editor.canvas_height || new_pos.y < 0){
                    /*
                      Users will expect that when they undo, the
                      object will both be undeleted and move to the
                      starting position. Use a composite action to
                      achieve this.
                    */
                    console.log("Deleting.");
                    var action = new CompositeAction();

                    // Delete the segments that were thrown off the screen
                    var del_action = new DeleteSegments(Editor.selected_segments);
                    del_action.Apply();
                    Editor.clearSelectedSegments();

                    // Create a composite object and register it with the Editor
                    action.add_action(Editor.current_action);
                    Editor.add_action(action);
                    action.add_action(del_action);

                    return;
                }
                window.setTimeout(box_momentum, 15, step - 1, duration - stepDuration, new_velocity, new_pos, now);
                
            }
            if(distance > 100){
                console.log("Editor state: " + Editor.state);
                window.setTimeout(box_momentum, 15, 10, duration, velocity, recent_pos, new Date());
                return;
            }

            // ipad: touchend occurs when finger physically leaves the screen.
            if (theEvent.pageX < offSet || theEvent.pageX > canvasDims.right - offSet ||
                theEvent.pageY  < toolbarDims.bottom || 
                theEvent.pageY > canvasDims.height - 2 * offSet ) {
                Editor.deleteTool();
            } else {
                if (Editor.state == EditorState.MovingSegments) {
                    Editor.state = EditorState.SegmentsSelected;
                    Editor.current_action.add_new_transforms(Editor.selected_segments);
                } else {
                    Editor.selectPenTool();
                }
            }
            break;
        case EditorState.MiddleOfStroke:
            var set_id_changes = [];
            Editor.state = EditorState.ReadyToStroke;
            if(Editor.current_stroke.finish_stroke()) {
                set_id_changes = Editor.current_stroke.test_collisions();
                RecognitionManager.enqueueSegment(Editor.current_stroke);
            } else {
                Editor.segments.pop();
            }
            
            Editor.current_stroke = null;
            Editor.current_action.set_id_changes = set_id_changes;
            Editor.current_action.buildSegmentXML();
            break;
        case  EditorState.Resizing:
            Editor.state = EditorState.SegmentsSelected;
            for(var k = 0; k < Editor.selected_segments.length; k++)
                Editor.selected_segments[k].freeze_transform();
            Editor.current_action.add_new_transforms(Editor.selected_segments);
            RenderManager.render();
            Editor.resize_offset = new Vector2(0,0);
            break;
        }
    }
}

Editor.mapCanvasBackspace = function(e)
{
    if(e.keyCode == KeyCode.backspace)
    {
        // Check whether the text box has focus.
        textBox = document.getElementById("tex_result");
        if (document.querySelector(":focus") == textBox) {
            // Act as normal.
        } else {
            // If we're not in the text box, need to avoid going 'back'
            // when we press backspace in Safari and some other browsers.
            switch (Editor.state)
            {
            case EditorState.MiddleOfText:
                e.preventDefault();
                Editor.current_text.popCharacter();
                break;
            default:
                // Otherwise, delete any selections.
                e.preventDefault();
                Editor.deleteTool();
                break;
            }
        }
    }

    if(e.keyCode == KeyCode.del) {
        Editor.deleteTool();
    }
    
}

Editor.onKeyPress = function(e)
{
    // For touch-and-hold
    Editor.lastEvent = e;

    if (Editor.touchAndHoldFlag == TouchAndHoldState.MouseDownAndStationary)
        return;

    // RLAZ: map enter to issuing the search.
    if(e.keyCode == KeyCode.enter) {
        Editor.search();
        return;
    } 

    // RLAZ: skip deletes (46) and backspaces (8), handled in mapCanvasBackspace()
    if(e.keyCode == KeyCode.backspace || e.keyCode == KeyCode.del)
        return;

    switch(Editor.state)
    {
    case EditorState.MiddleOfText:
        textBox = document.getElementById("tex_result");
        if (document.querySelector(":focus") != textBox &&
            Editor.current_text != null) {
            Editor.current_text.addCharacter(String.fromCharCode(e.which));
        }
        break;
        
    case EditorState.ReadyToRectangleSelect:
    case EditorState.ReadyToStrokeSelect:
    case EditorState.ReadyToStroke:
        textBox = document.getElementById("tex_result");
        if (document.querySelector(":focus") == textBox) {
            break
        }

        Editor.typeTool();
        var clicked_points = CollisionManager.get_point_collides(Editor.mouse_position);
        
        var s = new SymbolSegment(Editor.mouse_position);
        Editor.current_text = s;
        Editor.current_text.addCharacter(String.fromCharCode(e.which));

        Editor.state = EditorState.MiddleOfText;
        break;

    case EditorState.SegmentsSelected:
        if ( Editor.segments.length > 0
             && ( e.keyCode == KeyCode.left_arrow || e.keyCode == KeyCode.up_arrow ||
                  e.keyCode == KeyCode.right_arrow || e.keyCode == KeyCode.down_arrow ) ) {
            
            if ( Editor.selected_segments.length == 0 ) {
                var seg_to_add = Editor.segments[ Editor.segments.length - 1 ];
                var seg_set_id = seg_to_add.set_id;
                for ( var i = 0; i < Editor.segments.length; i++ ) {
                    if ( Editor.segments[ i ].set_id == seg_set_id ) Editor.add_selected_segment( Editor.segments[ i ] );
                }
                Editor.state = EditorState.SegmentsSelected;
                RenderManager.render();                    
            } else {

                var cur_seg = Editor.selected_segments[ 0 ]; // use first for location
                var cur_seg_loc = new Vector2( ( cur_seg.translation.x + ( cur_seg.translation.x + cur_seg.size.x ) ) / 2, ( cur_seg.translation.y + ( cur_seg.translation.y + cur_seg.size.y ) ) / 2 );
                var filter;
                
                switch ( e.keyCode ) {
                case KeyCode.left_arrow:
                    filter = function( s ) { return s.translation.x <= cur_seg.translation.x; };
                    break;
                    
                case KeyCode.up_arrow: 
                    filter = function( s ) { return s.translation.y <= cur_seg.translation.y; };
                    break;
                    
                case KeyCode.right_arrow:
                    filter = function( s ) { return s.translation.x >= cur_seg.translation.x; };
                    break;
                    
                case KeyCode.down_arrow:
                    filter = function( s ) { return s.translation.y >= cur_seg.translation.y; };
                    break;
                    
                default:
                    break;
                }
                
                var min_dist = -1;
                var min_dist_index = -1;
                
                for ( var n = 0; n < Editor.segments.length; n++ ) {
                    var seg = Editor.segments[ n ];
                    if ( seg.set_id == cur_seg.set_id || !filter( seg ) ) continue;
                    
                    var seg_loc = new Vector2(( seg.translation.x + seg.translation.x + seg.size.x ) / 2, ( seg.translation.y + seg.translation.y + seg.size.y ) / 2);
                    
                    var dist = Vector2.Distance( seg_loc, cur_seg_loc );
                    if ( min_dist == -1 || dist < min_dist ) {
                        min_dist = dist;
                        min_dist_index = n;
                    }
                }
                
                if ( min_dist_index == -1 ) break; // min_dist_index = Editor.segments.length - 1;
                
                Editor.clear_selected_segments();
                
                var seg_to_add = Editor.segments[ min_dist_index ];
                var seg_set_id = seg_to_add.set_id;
                for ( var i = 0; i < Editor.segments.length; i++ ) {
                    if ( Editor.segments[ i ].set_id == seg_set_id ) Editor.add_selected_segment( Editor.segments[ i ] );
                }
                
                RenderManager.render();
            }
        } else {
            switch ( e.keyCode ) {
            case KeyCode.g:
                Editor.groupTool();
                break;
            case KeyCode.l:
                Editor.relabel(Editor.state);
                break;
            case KeyCode.p:
                Editor.selectPenTool;
                break;
            default:
            }
        }
        break;
        
    }
}

//-----------------
// Hammer Events
// ----------------
Editor.onPinchStart = function(e){ // e is a Hammer.js event
    // Need to clear the moveQueue so that there is no velocity at the end of the touch
    Editor.add_action(new TransformSegments(Editor.selected_segments));
    Editor.state = EditorState.PinchResizing;
    
    Editor.original_bb = Editor.selected_bb.clone();
    var bb = Editor.original_bb;

    // Store the center of the bounding box as the anchor point for the resize
    var bb_size = Vector2.Subtract(bb.maxs, bb.mins);
    this.anchor = new Vector2(bb.mins.x  + bb_size.x / 2, bb.mins.y + bb_size.y / 2);
}

Editor.onPinch = function(e){ 
    // For some reason the scale
    // returns 0 sometimes, this is why the object would suddenly get
    // tiny
    if(e.scale == 0)
        return;
    for(var n = 0; n < Editor.selected_segments.length; n++){
        Editor.selected_segments[n].resize(this.anchor, new Vector2(e.scale, e.scale));
    }

    Editor.update_selected_bb();
    RenderManager.render();
}

Editor.onPinchEnd = function(e){
    // End the transform
    console.log("pinch end");
    for(var n = 0; n < Editor.selected_segments.length; n++){
        Editor.selected_segments[n].freeze_transform();
    }
    Editor.current_action.add_new_transforms(Editor.selected_segments);
    Editor.update_selected_bb();
    RenderManager.render();

    // Restore the previous state
    Editor.changeState(EditorState.SegmentsSelected);
    Editor.moveQueue = null;
}

//--------------------------------------------------
// 
// Editing modes/states
// 
//-------------------------------------------------- 
Editor.selectPenTool = function(draw_now)
{
    Editor.clearButtonOverlays();
    
    Editor.button_states[Buttons.Pen].setSelected(true);
    Editor.clear_selected_segments();
    Editor.current_stroke = null;
    
    switch(Editor.state)
    {
    case EditorState.MiddleOfText:
        Editor.current_text.finishEntry();
        if(Editor.current_action.toString() == "EditText")
            Editor.current_action.set_current_text(Editor.current_text.text);
        else if(Editor.current_action.toString() == "AddSegments")
            Editor.current_action.buildSegmentXML();
        Editor.current_text = null;
        break;
    }

    Editor.state = EditorState.ReadyToStroke;
    RenderManager.editColorOCRbbs();
    RenderManager.render();
}

Editor.strokeSelectionTool = function()
{
    if(Editor.button_states[Buttons.Stroke].enabled == false)
        return;
    Editor.clearButtonOverlays();
    Editor.button_states[Buttons.Stroke].setSelected(true);
    
    switch(Editor.state)
    {
    case EditorState.MiddleOfText:
        Editor.current_text.finishEntry();
        if(Editor.current_action.toString() == "EditText")
            Editor.current_action.set_current_text(Editor.current_text.text);
        else if(Editor.current_action.toString() == "AddSegments")
            Editor.current_action.buildSegmentXML();                
        Editor.current_text = null;
    }
    
    if(Editor.selected_segments.length == 0)
        Editor.state = EditorState.ReadyToStrokeSelect;
    else
        Editor.state = EditorState.SegmentsSelected;

    RenderManager.regColorOCRbbs();
    RenderManager.render();
    Editor.selection_method = "Stroke";
}

Editor.rectangleSelectionTool = function()
{
    // DEBUG: was Buttons.Box -> Buttons.Rectangle
    if(Editor.button_states[Buttons.Rectangle].enabled == false)
        return;

    Editor.clearButtonOverlays();
    Editor.button_states[Buttons.Rectangle].setSelected(true);

    switch(Editor.state)
    {
    case EditorState.MiddleOfText:
        Editor.current_text.finishEntry();
        if(Editor.current_action.toString() == "EditText")
            Editor.current_action.set_current_text(Editor.current_text.text);
        else if(Editor.current_action.toString() == "AddSegments")
            Editor.current_action.buildSegmentXML();                
        Editor.current_text = null;
    }
    
    if(Editor.selected_segments.length == 0)
        Editor.state = EditorState.ReadyToRectangleSelect;
    else
        Editor.state = EditorState.SegmentsSelected;

    RenderManager.regColorOCRbbs();
    RenderManager.render();    
    Editor.selection_method = "Rectangle";
}

Editor.align = function()
{
    switch(Editor.state)
    {
    case EditorState.MiddleOfText:
        Editor.current_text.finishEntry();
        if(Editor.current_action.toString() == "EditText")
            Editor.current_action.set_current_text(Editor.current_text.text);
        else if(Editor.current_action.toString() == "AddSegments")
            Editor.current_action.buildSegmentXML();                
        Editor.current_text = null;
    }
    RenderManager.clear_canvas();


    // an array of tuples
    // recognition result, min bb, max bb, set id
    var data = new Array();

    //iterate throuogh all of the segment sets and identify each bounding box (and symbol)
    var set_segments = new Array();
    // segments are in order by set id
    Editor.segments.push(null);    // add null pointer so we can easily render last set in list
    var set_index = 0;
    for(var k = 0; k < Editor.segments.length; k++)
    {
        var seg = Editor.segments[k];
        if(set_segments.length == 0)
            set_segments.push(seg);
        else if(seg == null || seg.set_id != set_segments[0].set_id)
        {
            var mins = set_segments[0].worldMinPosition();
            var maxs = set_segments[0].worldMaxPosition();
            
            for(var j = 1; j < set_segments.length ; j++)
            {
                var seg_min = set_segments[j].worldMinPosition();
                var seg_max = set_segments[j].worldMaxPosition();
                
                if(seg_min.x < mins.x)
                    mins.x = seg_min.x;
                if(seg_min.y < mins.y)
                    mins.y = seg_min.y;
                
                if(seg_max.x > maxs.x)
                    maxs.x = seg_max.x;
                if(seg_max.y > maxs.y)
                    maxs.y = seg_max.y;
            }
            
            var origMins = mins.clone();
            var origMaxs = maxs.clone();
            var recognition_result = RecognitionManager.getRecognition(set_segments[0].set_id);
            // If it's a text segment, account for the draculae making x's smaller than t's, etc
            
            if (set_segments[0].constructor == SymbolSegment) {
                size = Vector2.Subtract(maxs, mins);
                if (-1 != $.inArray(set_segments[0].text, Editor.x_height_chars)) {
                    mins.y += size.y / 2;
                }
                if (-1 != $.inArray(set_segments[0].text, Editor.descender_chars)) {
                    mins.y += size.y / 2;
                    maxs.y += size.y / 2;
                } 
            }
            var tuple = new Tuple(recognition_result, mins, maxs, origMins, origMaxs);
            data.push(tuple);
            
            set_segments.length = 0;
            set_segments.push(seg);
        }
        else
            set_segments.push(seg);
    }
    Editor.segments.pop();
    
    /* build XML request here:
       <SegmentList>
       <Segment symbol="S" min="0,0" max="10,10" id="24"/>
       </SegmentList>
       
       
    */
    
    var sb = new StringBuilder();
    sb.append("?segments=<SegmentList>");
    for(var k = 0; k < data.length; k++)
    {
        var t = data[k];
        sb.append("<Segment symbol=\"");
        if(t.item1.symbols.length == 0)
            sb.append("x\" min=\"");
        else
            sb.append(t.item1.symbols[0]).append("\" min=\"");
        sb.append(new Vector2(Math.floor(t.item2.x), Math.floor(t.item2.y)).toString()).append("\" max=\"");
        sb.append(new Vector2(Math.floor(t.item3.x), Math.floor(t.item3.y)).toString()).append("\" id=\"");
        sb.append(t.item1.set_id).append("\"/>");
    }
    sb.append("</SegmentList>");
    
    $.ajax
    (
        {
            url: Editor.align_server_url + sb.toString(),
            success: function(in_data, textStatus, xmlhttp)
            {
                // parse response here
                var new_dimensions = new Array();

                // parse response xml
                var xmldoc = in_data;
                var segment_nodes = xmldoc.getElementsByTagName("Segment");
                var tex_nodes = xmldoc.getElementsByTagName( "TexString" );
                
                if(segment_nodes.length == 0)
                {
                    alert("DRACULAE Error: " + in_data);
                    return;
                }
                
                // Update the current slide with the TeX.
                if ( tex_nodes.length != 0 ) {
                    var tex_string = tex_nodes[ 0 ].textContent;
                    // get just the math, removing spaces
                    var tex_math = tex_string.split("$").slice(1,-1).join("").replace( /\s*/g, "" );
					Editor.slider.updateSlide(tex_math);
                }
                
                for(var k = 0; k < segment_nodes.length; k++)
                {
                    var attributes = segment_nodes[k].attributes;
                    var t = new Tuple();
                    t.item1 = parseInt(attributes.getNamedItem("id").value);
                    t.item2 = parseVector2(attributes.getNamedItem("min").value);
                    t.item3 = parseVector2(attributes.getNamedItem("max").value)
                    new_dimensions.push(t);

                }
                
                // foreach segment set
                
                var transform_action = new TransformSegments(Editor.segments);
                
                for(var k = 0; k < new_dimensions.length; k++)
                {
                    var t = null;
                    // find tuple containing original size of segment
                    for(var j = 0; j < data.length; j++)
                    {
                        if(data[j].item1.set_id == new_dimensions[k].item1)
                        {
                            t = data[j];
                            break;
                        }
                    }

                    if(t == null)
                        continue;
                    
                    var set_id = new_dimensions[k].item1;
                    var segments = Editor.get_segment_by_id(set_id);
                    
                    var min_0 = t.item4;
                    var max_0 = t.item5;
                    
                    var min_f = new_dimensions[k].item2;
                    var max_f = new_dimensions[k].item3;
                    
                    var size0 = Vector2.Subtract(max_0, min_0);
                    var sizef = Vector2.Subtract(max_f, min_f);
                    
                    // If it's a text segment, account for the draculae making x's smaller than t's, etc
                    if (segments.length == 1 && segments[0].constructor == SymbolSegment) {
                        if (-1 != $.inArray(segments[0].text, Editor.x_height_chars)) {
                            min_f.y -= sizef.y;
                            sizef.y *= 2;
                        }
                        if (-1 != $.inArray(segments[0].text, Editor.descender_chars)) {
                            min_f.y -= sizef.y / 2;
                        }
                    }
                    
                    var scale = new Vector2(sizef.x / size0.x, sizef.y / size0.y);
                    
                    var translation = new Vector2();
                    translation.x = scale.x * min_f.x - min_0.x;
                    translation.y = scale.y * min_f.y - min_0.y;
                    
                    
                    for(var i = 0; i < segments.length; i++)
                    {
                        segments[i].resize(min_0, scale);
                        segments[i].freeze_transform();
                        segments[i].translate(Vector2.Subtract(min_f, min_0));
                        segments[i].freeze_transform();
                    }
                    
                }
                
                transform_action.add_new_transforms(Editor.segments);
                transform_action.Apply();
                Editor.add_action(transform_action);
                //RenderManager.render();
            },
            error: function(jqXHR, textStatus, errorThrown)
            {
                console.log(jqXHR);
                console.log(textStatus);
                console.log(errorThrown);
            }
        }
    );
}

// adds currently selected segments to a single segment group object
// the individual segments in the group remain in their type's render layer, 
// so no need to remove or re-render
Editor.groupTool = function()
{
    if(Editor.selected_segments.length > 0 && Editor.state == EditorState.SegmentsSelected)
    {
        // get a new uid for this set
        var set_id = Segment.set_count++;
        Editor.add_action(new GroupSegments(Editor.selected_segments, set_id));
        
        var to_classify = new Array();
        for(var k = 0; k < Editor.selected_segments.length; k++)
        {
            var old_set_id = Editor.selected_segments[k].set_id;
            if(to_classify.contains(old_set_id) == false)
                to_classify.push(old_set_id);
            Editor.selected_segments[k].set_id = set_id;
        }

        // sort Editor segments by set_id
        // insertion sort works best for nearly sorted lists
        for(var i = 1; i < Editor.segments.length; i++)
        {
            var value = Editor.segments[i];
            for(var j = i - 1; j >= 0 && Editor.segments[j].set_id > value.set_id; j--)
                Editor.segments[j+1] = Editor.segments[j];
            Editor.segments[j+1] = value;
        }
        
        // RLAZ: restored this code, so that all modified objects are
        // reclassified.
        to_classify.push(set_id);
        for(var k = 0; k < to_classify.length; k++)
            RecognitionManager.classify(to_classify[k]);
        
        Editor.state = EditorState.SegmentsSelected;
    }
}

// will break apart selected segment group objects
Editor.ungroupTool = function()
{
    alert(Editor.state);
}

// deletes the currently selected segments
Editor.deleteTool = function()
{
    //if(Editor.button_states[Buttons.Delete].enabled == false)
    //    return;
    
    var action = new DeleteSegments(Editor.selected_segments)
    action.Apply();
    Editor.add_action(action);
    Editor.clearSelectedSegments();
}

/**
   Clear the selected segments from the canvas and then
   set the editor mode to the proper selection method.
**/
Editor.clearSelectedSegments = function(){
    Editor.clear_selected_segments();    
    RenderManager.render();
    console.log(Editor.selection_method);
    if(Editor.selection_method == "Stroke")
        Editor.state = EditorState.ReadyToStrokeSelect;
    else if(Editor.selection_method == "Rectangle")
        Editor.state = EditorState.ReadyToRectangleSelect;
}

Editor.typeTool = function()
{
    Editor.selected_segments.length = 0;
    Editor.current_stroke = null;
    Editor.clearButtonOverlays();

    Editor.button_states[Buttons.Pen].setSelected(true);
    Editor.button_states[Buttons.Rectangle].setSelected(false);
    Editor.button_states[Buttons.Stroke].setSelected(false);
    Editor.clear_selected_segments();
    
    switch(Editor.state)
    {
    case EditorState.SegmentsSelected:
        Editor.clear_selected_segments();
        break;
    case EditorState.MiddleOfText:
        if(Editor.current_action.toString() == "EditText")
            Editor.current_action.set_current_text(Editor.current_text.text);
        Editor.current_text = null;
        break;
    }
    Editor.state = EditorState.ReadyForText;
    RenderManager.render();
}

Editor.relabel = function(return_to)
{
    CorrectionMenu.show(return_to);
    Editor.clearButtonOverlays();
    for(var k = 0; k < Editor.button_states.length; k++)
        Editor.button_states[k].setEnabled(false);
}

// clears all the data and sends action list to server for storage
Editor.clear = function()
{
    // get rid of last one if it' a bugger
    if(Editor.action_list.length > 0)
    {
        var prev_action = Editor.action_list.pop();
        if(prev_action.shouldKeep() == true)
            Editor.action_list.push(prev_action);
    }
    
    // save data
    var sb = new StringBuilder();
    sb.append("?actionList=<ActionList>");
    for(var k = 0; k < Editor.action_list.length; k++)
    {
        sb.append(Editor.action_list[k].toXML());
    }
    sb.append("</ActionList>");
    $.get
    (
        Editor.data_server_url + sb.toString(),
        function(data, textStatus, xmlhttp)
        {
            window.location.reload( true ); // href = Editor.editor_root + "index.xhtml";
        }
    );
    
    // reset editor
    // ?????
}

Editor.getInkML = function() {
    var inkml = "<ink xmlns=\"http://www.w3.org/2003/InkML\">";
    var segments = new Array();
    var segarray = Editor.segments.slice( 0 );
    segarray.sort( function( o1, o2 ) { return o1.instance_id - o2.instance_id } );
    
    for ( var i = 0; i < segarray.length; i++ ) {
        var stroke = segarray[ i ];
        var strokeid = stroke.instance_id;
        var segid = stroke.set_id;
        
        // translation for absolute positioning
        var tx = stroke.translation.x;
        var ty = stroke.translation.y;
        var sx = stroke.scale.x;
        var sy = stroke.scale.y;
        // add to proper segment
        if ( segments[ segid ] == null ) segments[ segid ] = new Array();
        segments[ segid ].push( strokeid );
        
        // add stroke data to inkml
        inkml += "<trace id=\"" + strokeid + "\">";
        var strokedata = new Array();
        for ( var j = 0; j < stroke.points.length; j++ ) {
            strokedata.push( ( ( stroke.points[ j ].x * sx ) + tx ) + " " + ( ( stroke.points[ j ].y * sy ) + ty ) );
        }
        inkml += strokedata.join( ", " );
        inkml += "</trace>";        
    }
    
    for ( var i = 0; i < segments.length; i++ ) {
        if ( segments[ i ] == null ) continue;
        var strokeids = segments[ i ];
        
        inkml += "<traceGroup xml:id=\"TG" + i + "\">";
        
        // label
        inkml += "<annotation type=\"truth\">" + RecognitionManager.getRecognition( i ).symbols[ 0 ] + "</annotation>"
        
        for ( var j = 0; j < strokeids.length; j++ ) {
            inkml += "<traceView traceDataRef=\"" + strokeids[ j ] + "\" />";
        }
        
        inkml += "</traceGroup>";
    }
    inkml += "</ink>";
    
    if ( Editor.using_ipad ) {
        
        // ask for filename
        var fname = prompt( "Enter filename (leave blank for random)." );
        if ( fname == null ) return; // "cancel"
        
        // save to server
        $.ajax(
            {
                url: Editor.inkml_save_server_url + "?fname=" + fname + "&s=" + escape( inkml ),
                success: function( in_data, textStatus, xmlhttp ) {      
                    alert( "Saved: " + in_data.split( "!" )[ 1 ] );
                },
                error: function( jqXHR, textStatus, errorThrown ) {
                    console.log( jqXHR );
                    console.log( textStatus );
                    console.log( errorThrown );
                    if ( jqXHR.status == 0 ) {
                        alert( "Error: server offline." );
                    } else {
                        alert( "Error: " + textStatus + "/" + errorThrown );
                    }
                }
            }
        );
        
    } else {
        
        // save locally
        var datauri = "data:text/inkml," + escape( inkml ); // yes, this is an invalid mime type
        window.open( datauri );
        
    }
}

/*
  This method is complicated so let me explain what's going on:
  FileReader's readAsDataURL method and apparently Image's .src property are
  Asynchrynous, so we need to fire an event to do work instead of doing it sequentially.
  When the file is read as a data url, the first method is called which sets the data url
  as the Image's source.  That doesn't happen immediately, so another event is made
  for when the image's src is finished being set.  When this happens, then we forward
  the image to the render manager and the collision manager.
*/

Editor.onImageLoad = function(e)
{
    var file_list = e.target.files;
    var file = file_list[0];
    if(file)
    {
        var r = new FileReader();
        r.onload = function(e)
        {
            var loaded_image = new Image();
            
            // render image to canvas, get back the dataurl, send dataurl to server,
            // get back list of connected components in xml, add to managers
            var added_segments = new Array();
            loaded_image.onload = function(e)
            {
                var canvas = document.createElement("canvas");
                canvas.width = loaded_image.width;
                canvas.height = loaded_image.height;
                
                var context = canvas.getContext("2d");
                context.drawImage(loaded_image, 0, 0);
                
                // var dataUrl = canvas.toDataURL();
                inverseImage = ImageBlob.generateInverseImage(this);
                var blob = new ImageBlob(this, inverseImage);
                Editor.add_segment(blob);
                RecognitionManager.enqueueSegment(blob);
                
            }
            
            Editor.add_action(new AddSegments(added_segments));
            
            // set the result of the image load to the image object
            loaded_image.src = e.target.result;
        }
        r.readAsDataURL(file);

    }
    else
    {
        // file not loaded
    }
}

Editor.prevent_default = function(event)
{
    event.preventDefault();
}


////////////////////////////////////////
// New methods
////////////////////////////////////////
Editor.search = function(e) 
{
    // NOTE: CURRENTLY EXPERIMENTING WITH ONLY ONE TEXT BOX.
    var searchString = "";
    var engineType = document.getElementById("engineSelector").value;
	var keywords = document.getElementById("tex_result").value;
    var searchString = Editor.slider.expressions.join(' ');
	if (keywords) {
		searchString += ' ' + keywords;
	}


    /* INCOMPLETE */
    switch (engineType)
    {
    case 'LaTeX Search':
        url = 'http://latexsearch.com/latexFacets.do?searchInput=';
        searchString = searchString + '&stype=exact';
        break;
    case 'Wolfram Alpha':
        url='http://www.wolframalpha.com/input/?i=';
        break;
    case 'Google':
        url='http://www.google.com/search?q=';
        break;
    case 'David\'s Math Search':
        url = 'http://saskatoon.cs.rit.edu:9001/?query=';
        break;

    default:
        /* Currently NIST DLMF is the default (first list item) */
        url = 'http://dlmf.nist.gov/search/search?q=';
        break
    }
    searchString = encodeURIComponent(searchString);
    window.open(url + searchString);
}

Editor.goDPRL = function ()
{
    window.location = "http://www.cs.rit.edu/~dprl"
}

/*
  This method takes a state and then performs the necessary operations to switch
  to that state
*/
Editor.changeState = function(state){
    switch(state){
    case EditorState.PenMovingSegments: 
    case EditorState.ReadyToStroke:
        Editor.selectPenTool();
        break;
    case EditorState.RectangleSelecting:
        Editor.rectangleSelectionTool();
        break;
    case EditorState.StrokeSelecting:
        Editor.strokeSelectionTool();
        break;
    default:
        Editor.state = state;
    }
}
Editor.showToolTip = function(target, use){
	if (!Editor.using_ipad) {
		$('#' + target).tooltip({content: use, items: '#' + target});
	}
}
