// implements Segment

// points are stored in local space

PenStroke.count = 0;
PenStroke.type_id = 2;
function PenStroke(in_x, in_y, in_line_width)
{
    // identifiers to build unique id
    this.instance_id = Segment.count++;
    this.type_id = PenStroke.type_id;
    this.set_id = Segment.set_count++;
    
    // line width
    this.line_width = in_line_width;
    this.line_half_width = this.line_width / 2;
    
    this.collision_radius = this.line_width / 2.0 * 7.0;
    this.squared_collision_radius = this.collision_radius * this.collision_radius;

    // layer information
    this.layer = 0;
    
    this.points = new Array();
    this.points.push(new Vector2(in_x,in_y));
    
    // transform information
    this.scale = new Vector2(1.0, 1.0);
    this.translation = new Vector2(0.0, 0.0);
    
    this.temp_scale = new Vector2(1.0, 1.0);
    this.temp_translation = new Vector2(0.0, 0.0);

    
    // used to determine extents
    this.size = new Vector2(0.0, 0.0);
    
    this.world_mins = new Vector2(in_x,in_y);
    this.world_maxs = new Vector2(in_x,in_y);
    
    this.color = Editor.segment_color;
    this.stroke_width = Editor.stroke_width;
    /*
    this.root_div = document.createElement("div");
        this.root_div.className = "pen_stroke";
    Editor.canvas_div.appendChild(this.root_div);
    */
    // if true we need to update the SVG transform
    this.dirty_flag = false;
    
    this.element = null;
    this.classification_server = "PenStrokeClassifier";
}

PenStroke.prototype.update_extents = function()
{
    return;
}

PenStroke.prototype.worldMinPosition = function()
{
    var min = new Vector2(0,0).transform(this.scale, this.translation).transform(this.temp_scale, this.temp_translation);
    var max = this.size.transform(this.scale, this.translation).transform(this.temp_scale, this.temp_translation);
    
    return new Vector2(Math.min(min.x,max.x), Math.min(min.y, max.y));
}

PenStroke.prototype.worldMinDrawPosition = function()
{
    var result = this.worldMinPosition();
    result.x -= this.line_width ;
    result.y -= this.line_width ;
    return result;
}

PenStroke.prototype.worldMaxPosition = function()
{
    var min = new Vector2(0,0).transform(this.scale, this.translation).transform(this.temp_scale, this.temp_translation);
    var max = this.size.transform(this.scale, this.translation).transform(this.temp_scale, this.temp_translation);
    
    return new Vector2(Math.max(min.x,max.x), Math.max(min.y, max.y));
}

PenStroke.prototype.worldMaxDrawPosition = function()
{
    var result = this.worldMaxPosition();
    result.x += this.line_width ;
    result.y += this.line_width ;
    return result;
}

PenStroke.prototype.add_point = function(point_position)
{
    // just add the point to the list, render the line, and update the mins
    this.points.push(point_position)
    this.world_mins.x = Math.min(this.world_mins.x, point_position.x);
    this.world_mins.y = Math.min(this.world_mins.y, point_position.y);
    this.world_maxs.x = Math.max(this.world_maxs.x, point_position.x);
    this.world_maxs.y = Math.max(this.world_maxs.y, point_position.y);
    
    this.size = Vector2.Subtract(this.world_maxs, this.world_mins);
    
    // render
    var context = Editor.contexts[0];
    context.strokeStyle = Editor.segment_color;
    context.lineWidth = this.line_width;
    context.lineCap = "round";
    context.lineJoin = "round";

    var point_a = Vector2.Add(this.points[this.points.length - 2], this.translation);
    var point_b = Vector2.Add(this.points[this.points.length - 1], this.translation);
    
    context.beginPath();
        context.moveTo(point_a.x, point_a.y);
        context.lineTo(point_b.x, point_b.y);
    context.stroke();
    context.closePath();
    
}

PenStroke.prototype.finish_stroke = function()
{
    if(this.points.length == 1)
    {
        return false;
    }

    // add svg and apply appropriate transform here
    this.root_svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.root_svg.setAttribute("class", "pen_stroke");
        this.root_svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        this.root_svg.setAttribute("style", "position: absolute; left: 0px; top: 0px;");
        this.root_svg.setAttribute("width", "100%");
        this.root_svg.setAttribute("height", "100%");
        
        // build transform
        
        this.translation = this.world_mins.clone();
        
        this.group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        var sb = new StringBuilder();
        sb.append("translate(").append(this.temp_translation.x).append(',').append(this.temp_translation.y).append(") ");
        sb.append("scale(").append(this.temp_scale.x).append(',').append(this.temp_scale.y).append(") ");
        sb.append("translate(").append(this.translation.x).append(',').append(this.translation.y).append(") ");
        sb.append("scale(").append(this.scale.x).append(',').append(this.scale.y).append(')');
        
        this.group.setAttribute("transform", sb.toString());

        var show = document.forms[0].strokes.checked;
        if (show)
            this.group.setAttribute("style", "fill:none;stroke-linecap:round;");
        else
            this.group.setAttribute("style", "fill:none;stroke-linecap:round;visibility:hidden");
    
        // build polyline
        
        this.polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        
        sb.clear();
        for(var k = 0; k < this.points.length; k++)
        {
            this.points[k] = Vector2.Subtract(this.points[k], this.world_mins);
            sb.append(this.points[k].x).append(',').append(this.points[k].y).append(' ');
        }
        
        this.polyline.setAttribute("points", sb.toString());
        this.polyline.setAttribute("style", "stroke:" + this.color + ";stroke-width:" + this.stroke_width);

    this.group.appendChild(this.polyline);
    this.root_svg.appendChild(this.group);
    Editor.canvas_div.appendChild(this.root_svg);
    this.element = this.root_svg
    
    // clear the canvas
    RenderManager.clear_canvas();
    return true;
}

PenStroke.prototype.private_render = function(in_color, in_width)
{
    if(this.dirty_flag == false && this.color == in_color && this.stroke_width == in_width)
        return;
    this.dirty_flag = false;
    this.color = in_color;
    this.stroke_width = in_width;
    
    var sb = new StringBuilder();
    sb.append("translate(").append(this.temp_translation.x).append(',').append(this.temp_translation.y).append(") ");
    sb.append("scale(").append(this.temp_scale.x).append(',').append(this.temp_scale.y).append(") ");
    sb.append("translate(").append(this.translation.x).append(',').append(this.translation.y).append(") ");
    sb.append("scale(").append(this.scale.x).append(',').append(this.scale.y).append(')');
    
    this.group.setAttribute("transform", sb.toString());

    // scale factor to give illusion of scale independent line width
    var mean_scale = (Math.abs(this.scale.x * this.temp_scale.x) + Math.abs(this.scale.y * this.temp_scale.y)) / 2.0;
    this.polyline.setAttribute("style", "stroke:" + this.color + ";stroke-width:" + (this.stroke_width / mean_scale));
    
}

// just draw using the given context
PenStroke.prototype.render = function()
{
    this.private_render(Editor.segment_color, Editor.stroke_width);
}

PenStroke.prototype.render_selected = function(in_context)
{
    this.private_render(Editor.selected_segment_color, Editor.selected_stroke_width);
}

// determine if the passed in point (screen space) collides with our geometery
PenStroke.prototype.point_collides = function(click_point)
{
    var a = this.points[0].transform(this.scale, this.translation).transform(this.temp_scale, this.temp_translation);

    if(Vector2.SquareDistance(click_point, a) < this.squared_collision_radius)
        return true;
    
    for(var k = 1; k < this.points.length; k++)
    {
        var b = this.points[k].transform(this.scale, this.translation).transform(this.temp_scale, this.temp_translation);
        
        if(Vector2.SquareDistance(click_point, b) < this.squared_collision_radius)
            return true;
        
        // from point 0 and point 1, do collision testing based on line width
        var ab = Vector2.Subtract(b,a);
        var ac = Vector2.Subtract(click_point, a);
        
        var t = Vector2.Dot(ac, ab) / Vector2.Dot(ab, ab);
        
        if(t > 0.0 && t < 1.0)
        {
            // calculate position of projected point
            var d = new Vector2(a.x + t * ab.x, a.y + t * ab.y);
            // if the project point and the click point are within the line radius, return true
            if(Vector2.SquareDistance(d, click_point) < this.squared_collision_radius)
                return true;
        }
        a = b;        
    }
    return false;
}

PenStroke.prototype.line_collides = function(point_a, point_b)
{
    //if(this.point_collides(point_a) || this.point_collides(point_b))
    //    return true;
    
    // compute closest pts between eacch line segment (modified page 149 of orange book)
    
    ClosestDistanceSegmentSegment = function(p1, q1, p2, q2)
    {
        Clamp = function(f, min, max)
        {
            if(f <= min)
                return min;
            if(f >= max)
                return max;
            return f;
        }
        
        var d1 = Vector2.Subtract(q1, p1);
        var d2 = Vector2.Subtract(q2, p2);
        var r = Vector2.Subtract(p1, p2);
        var a = Vector2.Dot(d1, d1);
        var e = Vector2.Dot(d2, d2);
        var f = Vector2.Dot(d2, r);
        var EPSILON = 0.0001;
        
        var s, t, c1, c2;
        
        if(a <= EPSILON && e <= EPSILON)
        {
            c1 = p1;
            c2 = p2;
            var c1c2 = Vector2.Subtract(c1, c2);
            return Vector2.Dot(c1c2, c1c2);
        }
        if(a <= EPSILON)
        {
            s = 0.0;
            t = f / e;
            t = Clamp(t, 0, 1);
        }
        else
        {
            var c = Vector2.Dot(d1, r);
            if(e <= EPSILON)
            {
                t = 0.0;
                s = Clamp(-c / a, 0, 1);
            }
            else
            {
                var b = Vector2.Dot(d1, d2);
                var denom = a*e - b*b;
                if(denom != 0)
                    s = Clamp((b*f - c*e)/denom, 0, 1);
                else
                    s = 0;
                t = (b*s + f)/e;
                
                if(t < 0)
                {
                    t = 0;
                    s = Clamp(-c / a, 0, 1);
                }
                else if(t > 1)
                {
                    t = 1;
                    s = Clamp((b - c) / a, 0, 1);
                }
            }
        }
        
        c1 = Vector2.Add(p1,Vector2.Multiply(s,d1));
        c2 = Vector2.Add(p2,Vector2.Multiply(t,d2));
        var c1c2 = Vector2.Subtract(c1, c2);
        return Vector2.Dot(c1c2, c1c2);
    }
    
    var a = point_a;
    var b = point_b;
    
    for(var k = 1; k < this.points.length; k++)
    {
        var c = this.points[k-1].transform(this.scale, this.translation).transform(this.temp_scale, this.temp_translation);
        var d = this.points[k].transform(this.scale, this.translation).transform(this.temp_scale, this.temp_translation);
        
        var distance = ClosestDistanceSegmentSegment(a,b,c,d);
        if(ClosestDistanceSegmentSegment(a,b,c,d) <= this.line_width * 0.5)
            return true;
    }
    return false;
}

PenStroke.prototype.rectangle_collides = function(in_corner_a, in_corner_b)
{
    var e = 0.2;

    var noShift = new Vector2( 0, 0 );
    var scaleAdjust = new Vector2( e, e );
    
    var rect_min = new Vector2();
    var rect_max = new Vector2();
    
    rect_min.x = Math.min(in_corner_a.x, in_corner_b.x);
    rect_min.y = Math.min(in_corner_a.y, in_corner_b.y);
    
    rect_max.x = Math.max(in_corner_a.x, in_corner_b.x);
    rect_max.y = Math.max(in_corner_a.y, in_corner_b.y);
    
    rect_max.transform( noShift, scaleAdjust );
    
    // expand fixed amount equal to stroke width
    rect_min.x -= Editor.stroke_width;
    rect_min.y -= Editor.stroke_width;
    rect_max.x += Editor.stroke_width;
    rect_max.y += Editor.stroke_width;
    
    var stroke_min = this.worldMinPosition();
    var stroke_max = this.worldMaxPosition();
    
    // easy check to see we aren't colliding
    
    if(rect_max.x < stroke_min.x || rect_min.x > stroke_max.x) return false;
    if(rect_max.y < stroke_min.y || rect_min.y > stroke_max.y) return false;
    
    // now see if we double overlap
    
    if(stroke_min.x > rect_min.x && stroke_max.x < rect_max.x) return true;
    if(stroke_min.y > rect_min.y && stroke_max.y < rect_max.y) return true;
    
    // test points
    for(var k = 0; k < this.points.length; k++)
    {
        var p1 = this.points[k].transform(this.scale, this.translation).transform(this.temp_scale, this.temp_translation);
        if ( p1.x == in_corner_a.x && p1.y == in_corner_a.y
        || p1.x == in_corner_b.x && p1.y == in_corner_b.y ) return true;
    }
    
    for(var k = 0; k < this.points.length - 1; k++)
    {
        var p1 = this.points[k].transform(this.scale, this.translation).transform(this.temp_scale, this.temp_translation);
        var p2 = this.points[k+1].transform(this.scale, this.translation).transform(this.temp_scale, this.temp_translation);
        
        var ra1 = new Vector2();
        var ra2 = new Vector2();
        ra1.x = Math.min( p1.x, p2.x );
        ra1.y = Math.min( p1.y, p2.y );
        ra2.x = Math.max( p1.x, p2.x );
        ra2.y = Math.max( p1.y, p2.y );
        
        if ( ra1.x < rect_max.x && ra2.x > rect_min.x && ra1.y < rect_max.y && ra2.y > rect_min.y ) return true;
    }
    return false;
}

// translate by this amount
PenStroke.prototype.translate = function(in_offset)
{
    this.translation.Add(in_offset);
    
    this.update_extents();
    this.dirty_flag = true;
}

PenStroke.prototype.resize = function(in_origin, in_scale)
{
    this.temp_scale = new Vector2(in_scale.x, in_scale.y);
    this.temp_translation = Vector2.Subtract(in_origin, Vector2.Pointwise(in_origin, in_scale));
    
    this.update_extents();
    this.dirty_flag = true;
}

PenStroke.prototype.freeze_transform = function()
{
    // here we move the temp transform info to the final transform
    this.translation = Vector2.Add(this.temp_translation, Vector2.Pointwise(this.temp_scale, this.translation));
    this.scale = Vector2.Pointwise(this.scale, this.temp_scale);

    this.temp_scale = new Vector2(1,1);
    this.temp_translation = new Vector2(0,0);
    this.dirty_flag = true;
    this.update_extents();
}

PenStroke.prototype.toXML = function()
{
    var sb = new StringBuilder();
    sb.append("<Segment type=\"pen_stroke\" instanceID=\"");
    sb.append(String(this.instance_id));
    sb.append("\" scale=\"");
    sb.append(this.scale.toString());
    sb.append("\" translation=\"");
    sb.append(this.translation.toString());
    sb.append("\" points=\"");
    sb.append(this.points[0].toString());
    for(var k = 1; k < this.points.length; k++)
        sb.append("|").append(this.points[k].toString());
    sb.append("\"/>");
        
    return sb.toString();
}

PenStroke.prototype.save_state = function() 
{
    var state = {
        instance_id: this.instance_id,
        type_id: this.type_id,
        set_id: this.set_id,
        points: this.points,
        scale: this.scale,
        translation: this.translation,
        temp_scale: this.temp_scale,
        temp_translation: this.temp_translation,
        world_mins: this.world_mins,
        world_maxs: this.world_maxs
    };
    return state;
}

PenStroke.restore_state = function(state) {
    seg = new PenStroke(0, 0, 6);
    seg.instance_id = state.instance_id;
    seg.set_id = state.set_id;
    seg.scale = new Vector2(state.scale.x, state.scale.y);
    seg.translation = new Vector2(state.translation.x, state.translation.y);
    seg.temp_scale = new Vector2(state.temp_scale.x, state.temp_scale.y);
    seg.temp_translation = new Vector2(state.temp_translation.x, state.temp_translation.y);
    seg.world_mins = new Vector2(state.world_mins.x, state.world_mins.y);
    seg.world_maxs = new Vector2(state.world_maxs.x, state.world_maxs.y);
    seg.points = state.points.map(function(coords) {
        return Vector2.Add(new Vector2(coords.x, coords.y), seg.world_mins);
    });
    seg.finish_stroke();
    return seg;
}

PenStroke.prototype.test_collisions = function() {
    var collided_segments = new Array();
    for ( var i = 0; i < this.points.length - 1; i++ ) {
        var pa = this.points[ i ].transform( this.scale, this.translation );
        var pb = this.points[ i + 1 ].transform( this.scale, this.translation );
        
        for ( var j = 0; j < Editor.segments.length; j++ ) {
            if ( Editor.segments[ j ].instance_id == this.instance_id ) continue;
            
            if ( Editor.segments[ j ].rectangle_collides( pa, pb ) ) {
                // console.log( Editor.segments[ j ] );
                if ( !collided_segments.contains( Editor.segments[ j ] ) ) collided_segments.push( Editor.segments[ j ] );
            }
        }
    }
    
    if ( collided_segments.length == 1 ) {
        // if we collided with just one, adopt its setid
        this.set_id = collided_segments[ 0 ].set_id;
        //alert( "ONE COLLISION" );
    } else if ( collided_segments.length > 1 ) {
        // if we collided with more than one, get new setid
        //alert( "MORE THAN ONE COLLISION" );
        var newsetid = Segment.set_count++;
        this.set_id = newsetid;
        for ( var i = 0; i < collided_segments.length; i++ ) {
            collided_segments[ i ].set_id = newsetid;
        }
    } else {
        this.set_id = -1;
    }
}
