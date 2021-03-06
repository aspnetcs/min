/* 
* This file is part of min.
* 
* min is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
* 
* min is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
* 
* You should have received a copy of the GNU General Public License
* along with min.  If not, see <http://www.gnu.org/licenses/>.
* 
* Copyright (C) 2011-2014 Richard Pospesel, Kevin Hart, Lei Hu, Siyu Zhu, David Stalnaker,
* Christopher Sasarak, Robert LiVolsi, Awelemdy Orakwue, and Richard Zanibbi
* (Document and Pattern Recognition Lab, RIT) 
*/
/*
	This class contains some of the logic and events for the Editor as a whole. 
        
        Events are defined for the following:
			onImageLoad (browsers supporting FileReader only)
        Methods that change the state of the editor are:
               1. groupTool - Adds selected segments to one segment group.
               2. deleteTool
               3. typeTool
               4. relabel
               5. clear
        Other methods:
               1. align - Align objects on the canvas and populate the query bar with a LaTeX
               string.
               2. createGrid - Convert objects into a grid (e.g. matrix).
               2. search - submit the LaTeX query to a search engine.
    		      etc
*/

var EditorState = 
    {
        // select tool states
        "ReadyToStrokeSelect" : 14,
        "StrokeSelecting" : 15,
		"ReadyToRectangleSelect" : 2,
        "RectangleSelecting" : 3,
        
        // pen states
        "ReadyToStroke" : 4, 
        "MiddleOfStroke" : 5,

        // text tool states
        "ReadyForText" : 6, "MiddleOfText" : 7,

        // Segment (and primitive) selection, labeling
        "SegmentsSelected" : 8,
        "MovingSegments" : 9,
        "Resizing" : 10,
        "Relabeling" : 11,
        "PinchResizing": 12,

        // Editing text box.
        "InTextBox" : 13,

        // New: moving a symbol in edit mode; touch and hold state.
    };

var TouchAndHoldState = {
    "NoTouchAndHold": 0,
    "MouseDownAndStationary": 1,
    "FingerDownAndStationary": 2 // same as the above state, but happening on a touchscreen
};

Editor.lastEvent = null;
Editor.moveQueue = null;
Editor.touchAndHoldFlag = TouchAndHoldState.NoTouchAndHold;

Editor.texFiles = "";
Editor.texFileList = "";
Editor.dataCollection = false;
Editor.stroke_string = "";

// Called when Min is starting up. Just calls other methods
Editor.setup_events = function()
{
    var button_index = 0; // Sets default initial state (pen/touch entry)
    Editor.timeStamp = null;
    Editor.prevTimeStamp = null;
    
    PermEvents.setup_window();

    PermEvents.setup_toolbar();
    PermEvents.setup_document();
    PermEvents.check_url();

	//var dataCollection = Editor.dataCollection;

    // Select the pen tool
	Editor.button_states[Buttons.Pen].enabled = true;
}


// RESTORED from earlier code.
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

Editor.mapCanvasBackspace = function(e)
{
    if(e.keyCode == KeyCode.backspace)
    {
		// HACK: no text box now.
        // (for ground truth tools)
        textBox = document.getElementById("tex_result");
        if (document.querySelector(":focus") == textBox) {
            // Act as normal.
        } else {
            // If we're not in the text box, need to avoid going 'back'
            // when we press backspace in Safari and some other browsers.
            switch (Editor.state)
            {
            case EditorState.MiddleOfText:
                //e.preventDefault();
                //Editor.current_text.popCharacter();
                break;
            default:
                // Otherwise, delete any selections.
                e.preventDefault();
                Editor.deleteTool();
                $("#equation_canvas").off("keypress",Editor.current_mode.close_mode()).on("keypress", Editor.current_mode.init_mode());
				break;
            }
        }

        if(e.keyCode == KeyCode.del) {
            Editor.deleteTool();
            $("#equation_canvas").off("keypress",Editor.current_mode.close_mode()).on("keypress", Editor.current_mode.init_mode());
        }
    }
}


Editor.onKeyPress = function(e)
{
    // For touch-and-hold
    Editor.lastEvent = e;

    if (Editor.touchAndHoldFlag == TouchAndHoldState.MouseDownAndStationary)
        return;


    if(e.keyCode == KeyCode.enter && Editor.state == EditorState.MiddleOfText) {
    	$(Editor.canvas_div).off(Editor.current_mode.event_strings.onDown, Editor.current_mode.stopTextInput);
    	Editor.current_mode.stopTextInput(e);
    	e.stopPropagation();
    	Editor.enterHit = true;
        return;
    }
 
    // RLAZ: skip deletes (46) and backspaces (8), handled in mapCanvasBackspace()
    if(e.keyCode == KeyCode.backspace || e.keyCode == KeyCode.del)
        return;
}

// Calls DRACULAE 
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

    // iterate through all of the segment sets and identify each 
	// bounding box (and symbol)
    
	// segments are in order by set id
	// add null pointer so we can easily render last set in list
    
    var segSet = Editor.segments;
	if (Editor.state == EditorState.SegmentsSelected && 
		Editor.selected_segments.length > 0)
		segSet = Editor.selected_segments; 
	segSet.push(null);    
    
    var set_segments = new Array();
	for(var k = 0; k < segSet.length; k++)
    {
        var seg = segSet[k];
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
            
			// If a text segment, account for the DRACULAE making 
			// x's smaller than t's, etc
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
    // Remove the null segment that we pushed on the list.
	segSet.pop();
    
     
	// Construct URL request here.
    var sb = new StringBuilder();
	var subexprs = new Array();
	var subBSTs = new Array();
    sb.append("?segments=<SegmentList>");
    for(var k = 0; k < data.length; k++)
    {
        var t = data[k];
        sb.append("<Segment symbol=\"");
        if(t.item1.symbols.length == 0)
            sb.append("?\" min=\"");
        else {
	    	var latex;
	    	if(t.item1.symbols[0] == "&lt;")
    			latex = "lt";
    		else if(t.item1.symbols[0] == ">")
    			latex = "gt";
			else if (t.item1.symbols[0] == ",")
				latex = ",";
			else if (t.item1.symbols[0] == "/")
				latex = "/";
			else
		    	latex = RecognitionManager.symbol_to_latex[ t.item1.symbols[0] ];
		    	//console.log("HELP! : " + t.item1.symbols[0] + " LATEX: " + latex);
				if(latex == null){
			    	latex = RecognitionManager.symbol_to_latex[RecognitionManager.unicode_to_symbol[ t.item1.symbols[0].toLowerCase() ]];
			    	if(latex == null) {
						// symbols not in our generic table: use substitutions to
						// avoid problems with tex characters (treated as centered objects
						// by DRACULAE).
						sb.append("SID" + subexprs.length).append("\" min=\""); 
						subexprs.push(new Tuple(t.item1.symbols[0].trim(), "SID" + subexprs.length));
						subBSTs.push(new Tuple(t.item1.bst, "SID" + subBSTs.length));
					}
						else
				    	sb.append(latex).append("\" min=\"");
		    	}
	            else
				    sb.append(latex).append("\" min=\"");
	    
		}
		// Simpler, single option from before....
		//sb.append(t.item1.symbols[0]).append("\" min=\"");
		
		
		sb.append(new Vector2(Math.floor(t.item2.x), Math.floor(t.item2.y)).toString()).append("\" max=\"");
        sb.append(new Vector2(Math.floor(t.item3.x), Math.floor(t.item3.y)).toString()).append("\" id=\"");
        sb.append(t.item1.set_id).append("\"/>");
    }
    sb.append("</SegmentList>");

	console.log(sb.toString());
	//console.log("Segment string");
    
	var mergedSymbols = false;
    $.ajax
    (
        {
            url: Editor.align_server_url + sb.toString(),
            success: function(in_data, textStatus, xmlhttp)
            {
                // parse response here
                var new_dimensions = new Array();

                // parse response xml
                // RZ: modified draculae server to provide BST information. 
				var xmldoc = in_data;
                var segment_nodes = xmldoc.getElementsByTagName("Segment");
                var tex_nodes = xmldoc.getElementsByTagName( "TexString" );
                var bsts = xmldoc.getElementsByTagName("BST");

				// Addition from new min.
                var joined_nodes = xmldoc.getElementsByTagName("JoinedSegments");
	
				// Composite action to collect symbol and subexpression merges.
				var allMergeActions = new CompositeAction();
				
				if(segment_nodes.length == 0)
                {
                    alert("DRACULAE Error: " + in_data);
                    return;
                }
                
				tex_math = "?";
                // Update the current slide with the TeX.
                if ( tex_nodes.length != 0 ) {
                    var tex_string = tex_nodes[ 0 ].textContent;
                    // get just the math, removing spaces; small change to preserve spacing.
                    var tex_math = tex_string.split("$").slice(1,-1).join("").replace( /\s+/g, " " );
					// Replace subexpressions and special characters.
					for (var i = 0; i < subexprs.length; i++)
						tex_math = tex_math.replace(subexprs[i].item2, subexprs[i].item1);


					// Pattern replacements to match CROHME 2014 expression grammar.
					// Replacements for matrices/vectors bound by parentheses ('()'),
					// brackets ('[]'), and braces ('{}').
					tex_math = tex_math.replace(/\(\s*\\begin\{array\}\{[^\}]*\}/g, "\\begin{pmatrix}");
					tex_math = tex_math.replace(/\\end\{array\}\s*\)/g, "\\end{pmatrix}");
					
					tex_math = tex_math.replace(/\\lbrack\s*\\begin\{array\}\{[^\}]*\}/g, "\\begin{bmatrix}");
					tex_math = tex_math.replace(/\\end\{array\}\s*\\rbrack/g, "\\end{bmatrix}");
					
					tex_math = tex_math.replace(/\{\s*\\begin\{array\}\{[^\}]*\}/g, "\\begin{Bmatrix}");
					tex_math = tex_math.replace(/\\end\{array\}\s*\}/g, "\\end{Bmatrix}");
					
					tex_math = tex_math.replace(/\|\s*\\begin\{array\}\{[^\}]*\}/g, "\\begin{vmatrix}");
					tex_math = tex_math.replace(/\\end\{array\}\s*\|/g, "\\end{vmatrix}");
					

					console.log("REWRITTEN LATEX:\n" + tex_math);



					// Filter \left and \right demarcators, handle delimiters.
					// CHANGE: use pmatrix, bmatrix etc. indicators (see Action.GroupSegments)
					/*tex_math = tex_math.replace(/\\left/g, "");
					tex_math = tex_math.replace(/\\right/g, "");
					tex_math = tex_math.replace(/\(/g, "\\left(");
					tex_math = tex_math.replace(/\)/g, "\\right)");
					tex_math = tex_math.replace(/\[/g, "\\left[");
					tex_math = tex_math.replace(/\]/g, "\\right]");
					tex_math = tex_math.replace(/\\{/g, "\\left\{");
					tex_math = tex_math.replace(/\\}/g, "\\right\}");
					tex_math = tex_math.replace(/\\lbrack/g, "\\left\\lbrack");
					tex_math = tex_math.replace(/\\rbrack/g, "\\right\\rbrack");*/

					// Clean up and save TeX to the current slider pane.
					// Ampersand (col. seprators) must be handled specially for HTML.
					var slider_tex = tex_math;
					slider_tex = slider_tex.replace(/&amp;/g, "&");
					Editor.slider.updateSlide( null, slider_tex );
					
					// Construct BST; save to current slider pane.
					var bstFinal = bsts[0].textContent;
					// Replace subexpressions and special characters.
					for (var i = 0; i < subBSTs.length; i++)
						bstFinal = bstFinal.replace(subBSTs[i].item2, subBSTs[i].item1);
                	
					// HACK! Remove SUBSC for ',' '.' and \dots.
					// DEBUG: '.' matches any character - had to remove this.
					bstFinal = bstFinal.replace(/,\s*SUBSC\s\{\s*([^\}]+)\}/g, "\n$1");
					bstFinal = bstFinal.replace(/\.\s*SUBSC\s\{\s*([^\}]+)\}/g, "\n$1");
					bstFinal = bstFinal.replace(/ldots\s*SUBSC\s\{\s*([^\}]+)\}/g, "\n$1");
					
					// Don't forget to replace ',' by 'COMMA')
					//bstFinal = bstFinal.replace(/\n\,/g, "\nCOMMA");

					Editor.slider.updateBST(bstFinal);

					//console.log("Align BST Output ------------------------");
					//console.log(bstFinal);

					// Modification from newer min: represent and classify merged
					// symbols (e.g. when DRACULAE detects two lines as an '=', etc.)
					// Go through and change text attribute of segments for JoinedSegments
                	//
					//
					// DEBUG: for labeling, this is a problem, e.g. merging decimal
					// numbers, which we *do not* want to merge.
					if(joined_nodes.length == -5){
                		console.log(joined_nodes);
						mergedSymbols = true;
						compoundSymbols = false; //DEBUG - square root expressions are
												 // returned as a 'join.'
						for(var i = 0; i < joined_nodes.length; i++) {
                			// Parse information on merged segments.
							var str = joined_nodes[i].attributes.getNamedItem("id").value;
                			var ids = str.substring(0,str.length-1).split(",");
                			var texSymbol = joined_nodes[i].attributes.getNamedItem("symbol").value; 
							var symbol = 
								RecognitionManager.latex_to_symbol[
								 joined_nodes[i].attributes.getNamedItem("symbol").value];
                			console.log("JOINED SYMBOL: " + texSymbol);
							if(symbol == null)
                				symbol = joined_nodes[i].attributes.getNamedItem(
										"symbol").value;
							else if (texSymbol == "sqrt")
								compoundSymbols = true;
							if(symbol == "")
                				break;

							// Create a new segment/group.
							var segs = new Array();
							for(var j = 0; j < ids.length; j++)
								segs.push( 
										Editor.get_segment_by_id( parseInt(ids[j]) )[0]);
                			allMergeActions.add_action_end(new GroupSegments(segs, symbol, false, compoundSymbols));
						}
                	}
				}
			
				// Update the MathJax SVG for the canvas if a subexpression has
				// not been selected.
				if ( Editor.selected_segments.length == 0)
					Editor.MathJaxRender(tex_math);

				// If a group was selected, then merge the symbols into
				// a new segment, labeled by the TeX result.
				// Also add BST output.
				//
				// ASSUMPTION: grouping only used to define individual cells;
				// no nesting of cells or grids in a cell.
				if (Editor.selected_segments.length > 1 
						&& Editor.get_selected_set_ids().length > 1 
						&& EditorState.SegmentsSelected)
					allMergeActions.add_action_end(
						new GroupSegments(Editor.selected_segments, tex_math, false, true,
								bsts[0].textContent));
				
				// If there are any merge actions, add as one composite action.
				if (allMergeActions.action_list.length > 0) 
						Editor.add_action(allMergeActions);

			
				// DEBUG: to obtain valid BST in ground truth output, we need to
				// make a recursive call, so that the BST is defined using merged symbols.
            	//if (mergedSymbols) {
					// Dirty, but works for now.
				//	Editor.align();
				//}

				// Make sure to visualize the new grouping(s)
				RenderManager.render();

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

Editor.join_segments = function(new_recognition, symbol, set_id){
	var set_from_symbols_list = false;
	for ( var i = 0; i < new_recognition.symbols.length; i++ ) {
		if ( new_recognition.symbols[ i ] == symbol ) {
			var sym = symbol;
			var cer = new_recognition.certainties[ i ];
			new_recognition.symbols.splice( i, 1 );
			new_recognition.certainties.splice( i, 1 );
			new_recognition.symbols.unshift( sym );
			new_recognition.certainties.unshift( cer );
			new_recognition.set_id = set_id;
			RecognitionManager.result_table.push( new_recognition );
			set_from_symbols_list = true;
			break;
		}
	}
	// If no recognition was found in the result list, force the new symbol
	if(!set_from_symbols_list){
		var sym = symbol;
		var cer = 1;
		new_recognition.symbols.splice( 0, 1 );
		new_recognition.certainties.splice( 0, 1 );
		new_recognition.symbols.unshift( sym );
		new_recognition.certainties.unshift( cer );
		new_recognition.set_id = set_id;
		RecognitionManager.result_table.push( new_recognition );
	}
}


/*
	Scale the SVG to fit the canvas by decreasing its font size by 5%
*/
Editor.scale_tex = function(elem){
	var root = document.getElementById("Alignment_Tex").getElementsByClassName("MathJax_SVG")[0].firstChild;
	var rect = root.firstChild.getBoundingClientRect();
	var math_width = rect.left+rect.width;
	var math_height = rect.top+rect.height;
	if(math_width > (Editor.canvas_width-15) || math_height > (Editor.canvas_height-15)){
		elem.style.fontSize = (parseInt(elem.style.fontSize.split("%")[0]) - 10) + "%";
		MathJax.Hub.Queue(["Rerender",MathJax.Hub,elem], [$.proxy(Editor.scale_tex(elem), this)]);
	}else{
		return;
	} 
}

/* Gets the MathJax rendered SVG from the div, sorts them and canvas segments before
   applying alignment to the symbols on the canvas.
*/
// NOTE: 'itemx' is a reference to tuple element x (e.g. item1 for first tuple element).
// NOTE: if lower case letters on baseline, will move down slightly,
//       as top left will be where the "ascender" line is placed.
Editor.copy_tex = function(elem, outer_div, s)
{
	// Get the top-left and bottom right corner coordinates for symbols on canvas (as s).
	// Use only selected symbols if appropriate.

	// Obtain bounding box width and height for symbols on canvas; item1/item2 are
	// min and max (x,y) coordinates, respectively.
	var horMinOffset = 20; //pixels
	var verMinOffset = 20;
	var topLeft = new Vector2(horMinOffset, verMinOffset);
	//console.log("s: " + s.item1.x + "," + s.item1.y);
	//console.log("tld: " + topLeft.x + "," + topLeft.y);
	
	var rect_size = Vector2.Subtract(s.item2, s.item1);
	var dim_tuple = new Tuple(rect_size.x, rect_size.y); // need to scale to fit canvas elements
	
	// Obtain the rescaled width from MathJax.
	var root =
		document.getElementById("Alignment_Tex").getElementsByClassName("MathJax_SVG")[0].firstChild;
	var rect = root.firstChild.getBoundingClientRect();
	
	// Set the scale - take the canvas size into account from the MathJax
	// result.
	var target_width = (rect.width / rect.height) * dim_tuple.item2; 
	var	target_height = dim_tuple.item2; 
	
	var cwidth = $("#equation_canvas").width(); 
	var toolheight = $("#toolbar").height(); 
	var cheight = $("#equation_canvas").height() -
		toolheight; 
	//console.log("cwidth: " + cwidth + " theight: " + toolheight
	//			+ " cheight: " + cheight);

	// Scale to fit on the canvas.
	var threshold = 0.85;
	if (target_width > cwidth * threshold ) 
	{
		target_width =  cwidth * threshold;
		target_height = target_width * (rect.height / rect.width);
	}
	if (target_height > cheight * threshold)
	{
		target_height = cheight * threshold;
		target_width = target_height * (rect.width / rect.height);
	}

	//console.log("x: " + s.item1.x + " y: " + s.item1.y);
	//console.log("rect x:" + rect.left + " rect y: " + rect.top);
	
	// Calculate scale and append to g element of MathJax
	var scale = new Vector2( (target_width / rect.width), (target_height / rect.height) );
	// First group tag groups all MathJax SVGs
	var group = root.getElementsByTagName("g")[0]; 
	group.setAttribute("transform", "scale("+scale.x+","+scale.y+") matrix(1 0 0 -1 0 0)");

	var root = document.getElementById("Alignment_Tex").getElementsByClassName("MathJax_SVG")[0].firstChild;
	group = root.getElementsByTagName("g")[0];
	elem.style.width = group.getBoundingClientRect().width + "px";
	SVGTopLeft = new Vector2(group.getBoundingClientRect().left, group.getBoundingClientRect().top);

	// Displacement from the SVG rectangle to a point at top-left of the canvas.
	topLeftTranslation = new Vector2.Subtract(topLeft, SVGTopLeft);
	//console.log("SVGTopLeft: " + SVGTopLeft.x + ", " + SVGTopLeft.y);
	//console.log("TRANSLATION: " + topLeftTranslation.x + ", " + topLeftTranslation.y);
	// Make sure it fits the canvas
	//Editor.scale_tex(elem); // Just reduces the font size by 5%
	root = document.getElementById("Alignment_Tex").getElementsByClassName("MathJax_SVG")[0].firstChild;
	
	// Retrieve symbols from the div element in previous routine
	var use_tag_array = root.getElementsByTagName("use");
	var rect_tag_array = root.getElementsByTagName("rect");
	use_tag_array = Array.prototype.slice.call(use_tag_array);
	rect_tag_array = Array.prototype.slice.call(rect_tag_array);
	var elements = use_tag_array.concat(rect_tag_array);
	
	// Sort the svg and canvas elements
	Editor.forget_symbol_groups();
	var canvas_elements = Editor.sort_canvas_elements();
	
	x_pos = Editor.group_svg([], root.firstChild);
	x_pos.sort(Editor.compare_numbers);
	
	//Editor.print_sorted(x_pos, "use");
	//Editor.print_sorted(canvas_elements, "canvas");	
	
	// Start transformation process and alignment process.
	
	var transform_action = new TransformSegments(Editor.segments);
	Editor.apply_alignment(x_pos, canvas_elements, topLeftTranslation);
	transform_action.add_new_transforms(Editor.segments);
	transform_action.Apply();
	Editor.add_action(transform_action);
	
	Editor.restore_symbol_groups();

	x_pos = [];
	Editor.canvas_div.removeChild(outer_div);
	MathJax.Hub.Queue(["setRenderer", MathJax.Hub, "HTML-CSS"]);
}


// Creates a square root horizontal line and appends it to RenderManager's div for the sqrt
Editor.create_segment = function(x_pos){
	var sqrt;
	var horizontal_bar;
	var found = false;
	var data = String.fromCharCode(parseInt("221A",16));
	var segs = x_pos.slice(0, x_pos.length);
	for(var i = 0; i < x_pos.length; i++){
		if(x_pos[i].item3.getAttribute("href") == "#MJMAIN-221A"){
			sqrt = x_pos[i].item3.getBoundingClientRect();
			for(var j = 0; j < segs.length; j++){
				var rect = segs[j].item3.getBoundingClientRect();
				if(rect.left < sqrt.right && segs[j].item3.tagName == "rect" && rect.top > sqrt.top){
					found = true;
					horizontal_bar = segs[j];
					break;
				}
			}
		}
		if(found)
			break;
	}
	
	if(found){
		// copy rect element and put in RenderManager div
		for(var k = 0; k < RenderManager.segment_set_divs.length; k++){
			if(RenderManager.segment_set_divs[k].getAttribute("data-recognition") == data){
				var BBox_rect = RenderManager.segment_set_divs[k].getBoundingClientRect();
				var clone = horizontal_bar.item3.cloneNode(true);
				clone.removeAttribute("x");
				clone.removeAttribute("y");
				clone.removeAttribute("stroke");
				clone.setAttribute("fill", Editor.segment_fill);
				var x = BBox_rect.right;
				var y = BBox_rect.top;
				clone.setAttribute("transform", "translate(" + x + "," + y + ")");
				RenderManager.segment_set_divs[k].getElementsByTagName("g")[0].appendChild(clone);
			}
		}
		
	}
}

/* Joins SVG segments as one because MathJax splits some of them up sometimes
 	Mainly groups elements with href #MJMAIN-AF
*/
Editor.group_svg = function(elements, g){
	
	var children = g.childNodes;
	var notcontains_g = g.getElementsByTagName("g");
	if(notcontains_g.length == 0){ // Base case reached	
		for(var j = 0; j < children.length; j++){
				if(children[j].getAttribute("width") == "0"){
					continue;  	// Don't add it to the elements array. Not needed
				}
				if(children[j].getAttribute("href") == "#MJMAIN-AF" ){ 
					// Usually grouped together
					var parent_rect = g.getBoundingClientRect();
					var rect = children[j].getBoundingClientRect();
					var tuple_x = new Tuple(Math.round(rect.left), Math.round(rect.top), children[j], true, parent_rect.width, parent_rect.height);
					elements.push(tuple_x);
					break;
				}else{
					var rect = children[j].getBoundingClientRect();
					var tuple_x = new Tuple(Math.round(rect.left), Math.round(rect.top), children[j], false);
					elements.push(tuple_x);
				}
		}
		return elements;
		
	}else{ 
		// More g tags to explore
		for(var i = 0; i < children.length; i++){
				if( (children[i].tagName == "use" || children[i].tagName == "rect") && children[i].getAttribute("width") != "0"){
					if(children[i].getAttribute("href") == "#MJMAIN-AF" ){
						var parent_rect = g.getBoundingClientRect();
						var rect = children[i].getBoundingClientRect();
						var tuple_x = new Tuple(Math.round(rect.left), Math.round(rect.top), children[i], true, parent_rect.width, parent_rect.height);
						elements.push(tuple_x);
						break;
						
					}else{
						var rect = children[i].getBoundingClientRect();
						var tuple_x = new Tuple(Math.round(rect.left), Math.round(rect.top), children[i], false);
						elements.push(tuple_x);
					}
				}else
					elements = Editor.group_svg(elements, children[i]);
		}
	
	}
	return elements;
}



/*
	A function that returns the world min and max position for joined segments like the 
	the plus symbol (top left, bottom right).
*/
Editor.get_seg_dimensions =  function(set_segments)
{
	var mins = set_segments[0].worldMinDrawPosition();
    var maxs = set_segments[0].worldMaxDrawPosition();
            
	// Find the extent of the symbol (BB)
	for(var j = 1; j < set_segments.length; j++){
		var seg_min = set_segments[j].worldMinDrawPosition();
		var seg_max = set_segments[j].worldMaxDrawPosition();
		
		if(seg_min.x < mins.x)
			mins.x = seg_min.x;
		if(seg_min.y < mins.y)
			mins.y = seg_min.y;
		
		if(seg_max.x > maxs.x)
			maxs.x = seg_max.x;
		if(seg_max.y > maxs.y)
			maxs.y = seg_max.y;
	}
	return new Tuple(mins, maxs);
}


// Returns (set_id, BBox) quintuples for a list of 'segments'
// (i.e. individual primitives).
//
// This was taken from ".align" for convenience.
Editor.get_segment_BBoxes = function (seg_list)
{
	var segSet = seg_list;
	segSet.push(null);
	data = new Array();
    
	var set_segments = new Array();
	for(var k = 0; k < segSet.length; k++)
    {
        var seg = segSet[k];
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
            
            var tuple = new Tuple(set_segments[0].set_id, mins, maxs);
            data.push(tuple);
            
            set_segments.length = 0;
            set_segments.push(seg);
        }
        else
            set_segments.push(seg);
    }
    // Remove the null segment that we pushed on the list.
	segSet.pop();

	return data;
}


// Returns the BBox of an element
Editor.get_BBox = function(seg)
{
	var elem_rect;
	if(seg.constructor == SymbolSegment)
		elem_rect = seg.element.getBoundingClientRect();
	else
		elem_rect = seg.inner_svg.getBoundingClientRect();
	return elem_rect;
}

/* Sorts the render svg from mathjax from left to right and any segment whose x coordinate
   collides with another is sorted from top to bottom. Just compares the tops.
*/
Editor.sort_svg_positions = function(array)
{
	var x_pos = new Array(); // all x coordinates
	var current_x, current_y;
	for(var i = 0; i < array.length; i++){
		current_x = parseInt(array[i].getBoundingClientRect().left.toFixed(2));
		current_y = parseInt(array[i].getBoundingClientRect().top.toFixed(2));
		var tuple_x = new Tuple(current_x,current_y, array[i]);
		x_pos.push(tuple_x);
	}
	x_pos.sort(Editor.compare_numbers);
	
	// Remove zero width elements
	for(var i = 0; i < x_pos.length; i++){
		if(x_pos[i].item3.getAttribute("width") == "0"){
			x_pos.splice(i, 1);
		}
		
	}
	return x_pos;
}

// Prints the sorted SVG and canvas segments
Editor.print_sorted = function(array, type)
{
	var s;
	if(type == "use")
		s = "Use tag: ";
	else
		s = "Canvas tag: ";
	for(var l = 0; l < array.length; l++){
		if(type == "use" && array[l].item3.tagName == "use"){
			var unicode = array[l].item3.getAttribute("href").split("-")[1];
			var text = String.fromCharCode(parseInt(unicode,16));
			s += text;
		}else if(type == "use" && array[l].item3.tagName == "rect"){
			s += "-";
		}else{
			s += array[l].item3.text;
		}
	}
	console.log(s);
}

// Sorts all svg elements by x and y
// DIFF: if there are selected segments, consider only those.
Editor.sort_canvas_elements = function()
{
	var sorted = new Array();
	var sorted_set_ids = new Array();
	var current_x, current_y;
	var Segments = Editor.segments;
	//if(Editor.selected_segments.length > 0 && 
	//		Editor.state == EditorState.SegmentsSelected)
	//	Segments = Editor.selected_segments;
	for(var i = 0; i < Segments.length; i++){
		var seg = Segments[i];
		var seg_rect = Editor.get_BBox(seg);
		current_x = parseInt(seg_rect.left.toFixed(2));
		current_y = parseInt(seg_rect.top.toFixed(2))
		if(sorted_set_ids.contains(seg.set_id)){
			var last_element = sorted.pop();
			if(last_element.item1 > current_x) // use lowest x
				sorted.push(new Tuple(current_x,current_y,seg));
			else
				sorted.push(new Tuple(last_element.item1,last_element.item2,seg));
		}else{
			sorted.push(new Tuple(current_x,current_y,seg));
			sorted_set_ids.push(seg.set_id);
		}
	}
	sorted.sort(Editor.compare_numbers);
	return sorted;
}

// Sorts all svg elements by x and y for a given set of segments.
Editor.sort_segments = function( segments )
{
	var sorted = new Array();
	var sorted_set_ids = new Array();
	var current_x, current_y;
	for(var i = 0; i < segments.length; i++){
		var seg = segments[i];
		var seg_rect = Editor.get_BBox(seg);
		current_x = parseInt(seg_rect.left.toFixed(2));
		current_y = parseInt(seg_rect.top.toFixed(2))
		if(sorted_set_ids.contains(seg.set_id)){
			var last_element = sorted.pop();
			if(last_element.item1 > current_x) // use lowest x
				sorted.push(new Tuple(current_x,current_y,seg));
			else
				sorted.push(new Tuple(last_element.item1,last_element.item2,seg));
		}else{
			sorted.push(new Tuple(current_x,current_y,seg));
			sorted_set_ids.push(seg.set_id);
		}
	}
	sorted.sort(Editor.compare_numbers);
	return sorted;
}



// Compares passed in tuples by sorting by x and y
Editor.compare_numbers = function(a, b)
{
	if (a.item1 == b.item1 && a.item2 == b.item2) return 0;
  	else if (a.item1 == b.item1) return a.item2 > b.item2 ? 1 : -1;
  	else return a.item1 > b.item1 ? 1 : -1;
}

// Compare x coordinates.
Editor.compare_asc = function(a, b)
{
	if (a == b ) return 0;
	else return a > b ? 1 : -1;
}


Editor.orderBBLeftRight = function(t1, t2)
{
	console.log("t1");
	console.log(t1);
	var BB1Left = t1.item2.x;
	var BB2Left = t2.item2.x;

	return Editor.compare_asc(BB1Left, BB2Left);
}

Editor.orderRowsTopDown = function(t1, t2)
{
	var BB1Top = t1.x.item2.y;
	var BB2Top = t2.x.item2.y;

	return Editor.compare_asc(BB1Top, BB2Top);
}

/* Maps elements on canvas to corresponding MathJax rendered SVG symbol ('array')
 * and then moves symbols around to match the MathJax-generated SVG output.
   Note: This methods relies on the fact that Canvas segments have their
   recognition result as an instance. This is set in the RenderManager after
   recognition is gotten.  "PenStroke_Object".Text - Recognition result for the
   PenStroke

  topLeftTranslation - displacement from the rendered SVG to a chosen
  top-left position on the canvas.
*/
Editor.apply_alignment = function(array, canvas_elements, topLeftTranslation)
{
	//console.log(canvas_elements.length + " symbols received for alignment.");
	var sqrt_text = String.fromCharCode(parseInt("221A",16));
	var transformed_segments = new Array(); // holds segment set_ids found
	
	
	for(var i = 0; i < array.length; i++){
		var svg_symbol = array[i].item3;
		console.log("svg_symbol:");
		console.log(svg_symbol)

		// Recover the symbol label.
		var text = null;
		if(svg_symbol.getAttribute("href")){
			var unicode = svg_symbol.getAttribute("href").split("-")[1].toLowerCase();
			console.log("UNICODE: " + unicode);
			// Check our symbol table. If not there just convert the unicode
			var result = RecognitionManager.unicode_to_symbol["&#x"+unicode+";"];
			if(result == null)
				text = String.fromCharCode(parseInt(unicode,16));
			else
				text = result;
			// special case character. Has zero-width space -> Look it up
			if(text == "−")
				text = "-";
			if(text == "¯") // Min doesn't have support for overlays
				text = "-";
		}
		else
		{
			text = "-"; // rect element is usually a division symbol which is _dash in Min	
		}

		// Identify canvas segments (e.g. symbols) that correspond to the MathJax segments/
		// symbols in the passed 'array' argument.
		console.log("Tex: " +  text);
		// Segment that matched a given set_id. Can also contain joined strokes
		var segments = null; 
		// Used to index into RenderManager's segment_set_div to get height and width below
		var index; 
		for(var j = 0; j < canvas_elements.length; j++){ 
			// Find the segment on canvas
			var set_id = canvas_elements[j].item3.set_id;
			if(canvas_elements[j].item3.text == text && (!transformed_segments.contains(set_id))){
				console.log("Match found for tex: " + text);
				transformed_segments.push(set_id);
				segments = Editor.get_segment_by_id(set_id);
				canvas_elements.splice(j,1); // remove segment from array
				index = j;
				break;
			}
		}
		if(segments == null)
			continue;
		
		console.log(transformed_segments.length + " symbols to transform.");

		// Apply transformation to segment - resize and move
		var size_f = new Vector2(0,0);
		// This is the MathJax BB for the symbol.
		var svg_symbol_rect = svg_symbol.getBoundingClientRect();
		
		// ?? WHAT IS THIS CASE?
		if(array[i].item4){
			size_f.x = array[i].item5;
			size_f.y = array[i].item6;
		}else{
			// "Normal" case for a single stroke symbol?
			size_f = new Vector2(svg_symbol_rect.width, svg_symbol_rect.height);
		}

		var svg_coord = new Vector2(svg_symbol_rect.left, svg_symbol_rect.top);
		var dimensions = Editor.get_seg_dimensions(segments);

		// Scale and translate segments
		// Translates top-left corner of the symbol to target destination
		// ('svg_coord') SUBTRACT: arg 1 - arg 2   (destination - current)
		console.log("SVG (LOCAL): " + svg_coord.x + ", " + svg_coord.y);
		console.log("DIMENSIONS: " + dimensions.item1.x + ", " +
				dimensions.item1.y);
		
		var in_offset = new Vector2.Add(topLeftTranslation, svg_coord);
		in_offset = new Vector2.Subtract(in_offset, dimensions.item1);
		console.log("OFFSET: " + in_offset); for(var k = 0; k <
				segments.length; k++){ segments[k].translate(in_offset);
			segments[k].freeze_transform(); }
		
		// Updated dimensions after svg_coord.
		dimensions = Editor.get_seg_dimensions(segments);
		
		// BB for segments on the canvas (width, height)
		var rect_size = Vector2.Subtract(dimensions.item2, dimensions.item1);
		var scale = new Vector2(size_f.x / rect_size.x, size_f.y /
				rect_size.y);
		
		// **Fix the scale so that it fits into the canvas.
		
		for(var k = 0; k < segments.length; k++){
			segments[k].resize(dimensions.item1, scale);
			segments[k].freeze_transform(); }
		
		/*
		if(tex_math.search("sqrt") != -1 && segments[0].text == sqrt_text){
		Editor.create_segment(array); }
		*/
	} 
}


// Utility function used to see the bounding rectangle. Not being used, was used for debugging
// alignment during scaling and translation.
// Used for debugging alignment. Just draws a BBox
Editor.draw_rect = function(dim){
	var div = document.createElement('div');
	div.className = Editor.current_mode.segment_style_class;
	div.style.visibility='visible';
	document.body.appendChild(div)
	div.style.visibility = "visible";
	div.style.left = dim.left + "px";
	div.style.top = dim.top + "px";
	div.style.width = dim.width + "px";
	div.style.height = dim.height + "px";
	div.style.backgroundColor = "red";
	div.style.opacity = "0.4";
	
	// version 2
	/*var div = document.createElement('div');
	div.className = Editor.current_mode.segment_style_class;
	div.style.visibility='visible';
	Editor.canvas_div.appendChild(div)
	div.style.visibility = "visible";
	div.style.left = dimensions.item1.x + "px";
	div.style.top = dimensions.item1.y + "px";
	div.style.width = rect_size.x + "px";
	div.style.height = rect_size.y + "px";
	div.style.backgroundColor = "green";
	div.style.opacity = "0";*/
}



// NEW: added to invoke creating a grid from selected cells.
Editor.createGrid = function()
{
    if(Editor.selected_segments.length > 1 
			&& Editor.get_selected_set_ids().length > 1
			&& Editor.state == EditorState.SegmentsSelected)
    {
		// RZ: Simplified this by moving processing inside the action object.
        Editor.add_action(new GroupSegments(Editor.selected_segments, "", true));
		Editor.state = EditorState.SegmentsSelected;
    }

}


// adds currently selected segments to a single segment group object
// the individual segments in the group remain in their type's render layer, 
// so no need to remove or re-render
Editor.groupTool = function()
{
    if(Editor.selected_segments.length > 0 
			&& Editor.get_selected_set_ids().length > 0
			&& Editor.state == EditorState.SegmentsSelected)
    {
		// RZ: Simplified this by moving processing inside the action object.
        Editor.add_action(new GroupSegments(Editor.selected_segments));
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
    //console.log(Editor.selection_method);
    Editor.state = EditorState.ReadyToRectangleSelect;
}

Editor.typeTool = function()
{
    Editor.selected_segments.length = 0;
    Editor.current_stroke = null;
    Editor.clearButtonOverlays();

    Editor.button_states[Buttons.Pen].setSelected(true);
    Editor.button_states[Buttons.Rectangle].setSelected(false);
    //Editor.button_states[Buttons.Stroke].setSelected(false);
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

/*
   cb is a callback to call after the Correction hides itself.  
*/
Editor.relabel = function(callback)
{
    Editor.clearButtonOverlays();
    for(var k = 0; k < Editor.button_states.length; k++)
        Editor.button_states[k].setEnabled(false);
    CorrectionMenu.show(callback);
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
    
    if ( Modernizr.touch ) {
        
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
    if(file_list[0].type == null)
    	return;
    else if(file_list[0].type == "text/plain")
		PermEvents.parse_text_file(file_list[0]);
	else
    	Editor.ParseImage(file_list[0]);
}

// This function is called when the user clicks on the upload image button
// And also when the user drags and drops a file on the canvas.
Editor.ParseImage = function(file){ 

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

////////////////////////////////////////
// Search operation
////////////////////////////////////////
Editor.search = function(e) 
{
    // NOTE: CURRENTLY EXPERIMENTING WITH ONLY ONE TEXT BOX.
    var searchString = "";
    var engineType = document.getElementById("engineSelector").value;
	var keywords = document.getElementById("tex_result").value;
    var searchString = Editor.slider.getCurrentExpression();
	searchString = searchString.replace(/\s/g, "");
    if (keywords) {
		searchString += ' ' + keywords;
	}


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
    case 'Tangent':
        url = 'http://saskatoon.cs.rit.edu:9001/?query=';
        break;
    case 'Wikipedia':
        url = 'http://en.wikipedia.org/w/index.php?title=Special%3ASearch&search=';
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

// Shows tool tips
Editor.showToolTip = function(target, use){
	if (!Modernizr.touch) {
		$('#' + target).tooltip({content: use, items: '#' + target});
	}
}
$.ctrl = function(key, callback, args) {
    $(document).keydown(function(e) {
        if(!args) args=[]; // IE barks when args is null 
        if(e.keyCode == key.charCodeAt(0) && e.ctrlKey) {
            callback.apply(this, args);
            return false;
        }
    });        
};
