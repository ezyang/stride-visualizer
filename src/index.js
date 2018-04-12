import React from 'react';
import ReactDOM from 'react-dom';
import * as d3 from 'd3v4';
import './index.css';

/**
 * An HTML5 range slider and associated raw text input.
 *
 * Properties:
 *    - min: The minimum allowed value for the slider range
 *    - max: The maximum allowed value for the slider range
 *    - value: The current value of the slider
 *    - disabled: Whether or not to disable the slider.  A slider
 *      is automatically disabled when min == max.
 *    - onChange: Callback when the value of this slider changes.
 */
function Slider(props) {
  const max = parseInt(props.max, 10);
  const min = parseInt(props.min, 10);
  const maxLength = max ? Math.ceil(Math.log10(Math.abs(max))) : 1;
  const disabled = props.disabled || min >= max;
  return (
    <span className="slider">
      <input type="range" min={min} max={max} value={props.value}
        onChange={props.onChange}
        disabled={disabled}
        />
      <input type="text" value={props.value}
        onChange={props.onChange}
        maxLength={maxLength}
        disabled={disabled}
        size={Math.max(maxLength, 2)}
        />
    </span>
  );
}

/**
 * Create a 1-dimensional array of size 'length', where the 'i'th entry
 * is initialized to 'f(i)', or 'undefined' if 'f' is not passed.
 */
function array1d(length, f) {
  return Array.from({length: length}, f ? ((v, i) => f(i)) : undefined);
}

/**
 * Create a 2-dimensional array of size 'height' x 'width', where the 'i','j' entry
 * is initialized to 'f(i, j)', or 'undefined' if 'f' is not passed.
 */
function array2d(height, width, f) {
  return Array.from({length: height}, (v, i) => Array.from({length: width}, f ? ((w, j) => f(i, j)) : undefined));
}

function array3d(depth, height, width, f) {
  return Array.from({length: depth}, (v, i) =>
         Array.from({length: height}, (v, j) =>
         Array.from({length: width},
          f ? ((w, k) => f(i, j)) : undefined)));
}

// We use the next two functions (maxWhile and minWhile) to
// inefficiently compute the bounds for various parameters
// given fixed values for other parameters.

/**
 * Given a predicate 'pred' and a starting integer 'start',
 * find the largest integer i >= start such that 'pred(i)'
 * is true OR end, whichever is smaller.
 */
function maxWhile(start, end, pred) {
  for (let i = start; i <= end; i++) {
    if (pred(i)) continue;
    return i - 1;
  }
  return end;
}

/**
 * Given a predicate 'pred' and a starting integer 'start',
 * find the smallest integer i <= start such that 'pred(i)'
 * is true OR end, whichever is larger.
 */
function minWhile(start, end, pred) {
  for (let i = start; i >= end; i--) {
    if (pred(i)) continue;
    return i + 1;
  }
  return end;
}

function watermarks(view_height, view_width, stride_height, stride_width) {
  // NB: both of these watermarks are INCLUSIVE
  // For example, if all strides are 0, we get [0, 0], which is true, we
  // will access the memory at 0.
  // NB: this does the RIGHT THING when height/width is zero.  Then high
  // watermark is negative while low watermark is zero, meaning the
  // empty range, which is precisely correct.

  let high_watermark = 0;
  if (stride_height > 0) high_watermark += (view_height - 1) * stride_height;
  if (stride_width > 0) high_watermark += (view_width - 1) * stride_width;

  let low_watermark = 0;
  if (stride_height < 0) low_watermark += (view_height - 1) * stride_height;
  if (stride_width < 0) low_watermark += (view_width - 1) * stride_width;

  return [low_watermark, high_watermark];
}

function paramsOK(storage_height, storage_width, storage_offset, view_height, view_width, stride_height, stride_width) {
  const wms = watermarks(view_height, view_width, stride_height, stride_width);

  if (wms[1] < wms[0]) return true;

  const storage_size = storage_height * storage_width;
  return wms[0] + storage_offset >= 0 && wms[1] + storage_offset < storage_size;
}

/**
 * Top-level component for the entire visualization.  This component
 * controls top level parameters like input sizes, but not the mouse
 * interaction with the actual visualized grids.
 */
class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      storage_height: 4,
      storage_width: 4,
      storage_offset: 0,
      view_height: 4,
      view_width: 4,
      stride_height: 4,
      stride_width: 1,
    };
  }

  // React controlled components clobber saved browser state, so
  // instead we manually save/load our state from localStorage.

  componentDidMount() {
    const state = localStorage.getItem("stride-visualizer");
    if (state) {
      this.setState(JSON.parse(state));
    }
  }

  componentDidUpdate() {
    localStorage.setItem("stride-visualizer", JSON.stringify(this.state));
  }

  render() {
    const storage_height = this.state.storage_height;
    const storage_width = this.state.storage_width;
    const storage_offset = this.state.storage_offset;
    const view_height = this.state.view_height;
    const view_width = this.state.view_width;
    const stride_height = this.state.stride_height;
    const stride_width = this.state.stride_width;

    const onChange = (state_key) => {
      return (e) => {
        const r = parseInt(e.target.value, 10);
        // Text inputs can sometimes temporarily be in invalid states.
        // If it's not a valid number, refuse to set it.
        if (typeof r !== "undefined") {
          this.setState({[state_key]: r});
        }
      };
    };

    const max_storage = 64;
    const max_size = 8;
    const max_stride = 8;

    return (
      <div>
        <h1>Stride Visualizer</h1>
        <div className="author">Edward Z. Yang</div>
        <p>
          Strides specify a factor by which an index is multiplied when computing its
          index into an array.  Strides are surprisingly versatile and can be used
          to program a large number of access patterns:
        </p>
        <ul>
          <li>Contiguous: each stride is the product of the corresponding tail of sizes</li>
          <li>Broadcasting: stride is zero</li>
          <li>Transpose: strides are swapped</li>
          <li>Flip: negative strides (storage offset must be adjusted accordingly)</li>
          <li>Diagonal: stride is one greater than size</li>
          <li>Rolling window: stride is less than size</li>
        </ul>
        <form className="form">
          <fieldset>
            <legend>Storage size:</legend>
            <Slider min={minWhile(max_storage, 1, (x) => paramsOK(x, storage_width, storage_offset, view_height, view_width, stride_height, stride_width))}
                    max={max_storage}
                    value={storage_height}
                    onChange={onChange("storage_height")}
                    />
            <Slider min={minWhile(max_storage, 1, (x) => paramsOK(storage_height, x, storage_offset, view_height, view_width, stride_height, stride_width))}
                    max={max_storage}
                    value={storage_width}
                    onChange={onChange("storage_width")}
                    />
          </fieldset>
          <fieldset>
            <legend>Storage offset:</legend>
            { /* These formulas don't handle the size = 0 boundary case correctly */ }
            <Slider min={Math.max(0, -watermarks(view_height, view_width, stride_height, stride_width)[0])}
                    max={storage_height * storage_width - Math.max(0, watermarks(view_height, view_width, stride_height, stride_width)[1]) - 1}
                    value={storage_offset}
                    onChange={onChange("storage_offset")}
                    />
          </fieldset>
          <fieldset>
            <legend>View size:</legend>
            <Slider min={0}
                    max={maxWhile(0, max_size, (x) => paramsOK(storage_height, storage_width, storage_offset, x, view_width, stride_height, stride_width))}
                    value={view_height}
                    onChange={onChange("view_height")}
                    />
            <Slider min={0}
                    max={maxWhile(0, max_size, (x) => paramsOK(storage_height, storage_width, storage_offset, view_height, x, stride_height, stride_width))}
                    value={view_width}
                    onChange={onChange("view_width")}
                    />
          </fieldset>
          <fieldset>
            <legend>View stride:</legend>
            <Slider min={minWhile(0, -max_stride, (x) => paramsOK(storage_height, storage_width, storage_offset, view_height, view_width, x, stride_width))}
                    max={maxWhile(0, max_stride, (x) => paramsOK(storage_height, storage_width, storage_offset, view_height, view_width, x, stride_width))}
                    value={stride_height}
                    onChange={onChange("stride_height")}
                    />
            <Slider min={minWhile(0, -max_stride, (x) => paramsOK(storage_height, storage_width, storage_offset, view_height, view_width, stride_height, x))}
                    max={maxWhile(0, max_stride, (x) => paramsOK(storage_height, storage_width, storage_offset, view_height, view_width, stride_height, x))}
                    value={stride_width}
                    onChange={onChange("stride_width")}
                    />
          </fieldset>
        </form>
        <Viewport {...this.state} />
      </div>
    );
  }
}

/**
 * The viewport into the actual meat of the visualization, the
 * tensors.  This component controls the state for hovering
 * and the animation.
 */
class Viewport extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      // Which matrix are we hovering over?
      hoverOver: undefined,
      // Which coordinate are we hovering over?  Origin
      // is the top-left corner.
      hoverH: undefined,
      hoverW: undefined,
      // What is our animation timestep?  A monotonically
      // increasing integer.
      counter: 0
    };
  }

  // Arrange for counter to increment by one after a fixed
  // time interval:

  tick() {
    this.setState({counter: this.state.counter + 1});
  }
  componentDidMount() {
    this.interval = setInterval(this.tick.bind(this), 500);  // 0.5 second
  }
  componentWillUnmount() {
    clearInterval(this.interval);
  }

  render() {
    const storage_height = this.props.storage_height;
    const storage_width = this.props.storage_width;
    const storage_offset = this.props.storage_offset;
    const view_height = this.props.view_height;
    const view_width = this.props.view_width;
    const stride_height = this.props.stride_height;
    const stride_width = this.props.stride_width;

    let hoverOver = this.state.hoverOver;
    let hoverH = this.state.hoverH;
    let hoverW = this.state.hoverW;

    // The primary heavy lifting of the render() function is to
    // define colorizer functions for each matrix, such that
    //
    //    colorizer(i, j) = color of the cell at i, j
    //
    let storageColorizer = undefined;
    let viewColorizer = undefined;

    // Given the animation timestep, determine the output coordinates
    // of our animated stencil.
    const animatedH = this.state.counter % view_height;

    // Don't have a good thing for this yet
    if (hoverOver === "storage") hoverOver = false;

    // If the user is not hovering over any matrix, render "as if"
    // they were hovering over the animated output coordinate.
    if (!hoverOver) {
      hoverOver = "output";
      hoverH = animatedH;
      hoverW = undefined;
    }

    const scale = d3.scaleSequential(d3.interpolateLab('#d7191c', '#2c7bb6')).domain([0, view_width])

    /*
    // The easy colorizers
    storageColorizer = (i, j) => {
      return xyScale(i, j);
    };

    viewColorizer = (i, j) => {
      const loc = storage_offset + i * stride_height + j * stride_width;
      return xyScale(Math.floor(loc / storage_width), loc % storage_width);
    };
    */

    if (hoverOver === "output" || true) {
      storageColorizer = (i, j) => {
        const flat = i * storage_width + j;
        for (let k = 0; k < view_width; k++) {
          if (hoverH * stride_height + k * stride_width + storage_offset === flat) return scale(k);
        }
        return "white";
      }
      viewColorizer = (i, j) => {
        if (hoverH !== i) return "white";
        return scale(stride_width ? j : 0);
      };
    }

    // The user is hovering over the output matrix (or the input matrix)
    /*
    if (hoverOver === "output") {
      outputColorizer = (i, j) => {
        const base = d3.color('#666')
        // If this output is selected, display it as dark grey
        if (hoverH === i && hoverW === j) {
          return base;
        }

        // Otherwise, if the output is animated, display it as a lighter
        // gray
        if (animatedH === i && animatedW === j) {
          return whiten(base, 0.8);
        }
      };

      const input_multiplies_with_weight = compute_input_multiplies_with_weight(hoverH, hoverW);
      const animated_input_multiplies_with_weight = compute_input_multiplies_with_weight(animatedH, animatedW);

      inputColorizer = inputColorizerWrapper((i, j) => {
        // If this input was used to compute the selected output, render
        // it the same color as the corresponding entry in the weight
        // matrix which it was multiplied against.
        const r = input_multiplies_with_weight[i * padded_input_size + j];
        if (r) {
          return xyScale(r[0], r[1]);
        }

        // Otherwise, if the input was used to compute the animated
        // output, render it as a lighter version of the weight color it was
        // multiplied against.
        const s = animated_input_multiplies_with_weight[i * padded_input_size + j];
        if (s) {
          return whiten(xyScale(s[0], s[1]), 0.8);
        }
      });

      // The weight matrix displays the full 2D color scale
      weightColorizer = (i, j) => {
        return xyScale(i, j);
      };

    // The user is hovering over the weight matrix
    } else if (hoverOver === "weight") {

      weightColorizer = (i, j) => {
        // If this weight is selected, render its color
        if (hoverH === i && hoverW === j) {
          return xyScale(hoverH, hoverW);
        }
      };

      // Compute a mapping from flat input index to output coordinates which
      // this input multiplied with the selected weight to produce.
      const input_produces_output = array1d(padded_input_size * padded_input_size);
      for (let h_out = 0; h_out < output_size; h_out++) {
        for (let w_out = 0; w_out < output_size; w_out++) {
          const flat_input = output[h_out][w_out][hoverH][hoverW];
          if (typeof flat_input === "undefined") continue;
          input_produces_output[flat_input] = [h_out, w_out];
        }
      }

      const animated_input_multiplies_with_weight = compute_input_multiplies_with_weight(animatedH, animatedW);

      inputColorizer = inputColorizerWrapper((i, j) => {
        // We are only rendering inputs which multiplied against a given
        // weight, so render all inputs the same color as the selected
        // weight.
        const color = xyScale(hoverH, hoverW);

        // If this input cell was multiplied by the selected weight to
        // produce the animated output, darken it.  This shows the
        // current animation step's "contribution" to the colored
        // inputs.
        const s = animated_input_multiplies_with_weight[i * padded_input_size + j];
        if (s) {
          if (s[0] === hoverH && s[1] === hoverW) {
            return color.darker(1);
          }
        }

        // If this input cell was multiplied by the selected weight to
        // produce *some* output, render it as the weight's color.
        const r = input_produces_output[i * padded_input_size + j];
        if (r) {
          // BUT, if the input cell is part of the current animation
          // stencil, lighten it so that we can still see the stencil.
          if (s) {
            return whiten(color, 0.2);
          }
          return color;
        }

        // If this input cell is part of the animated stencil (and
        // it is not part of the solid block of color), render a shadow
        // of the stencil so we can still see it.
        if (s) {
          return whiten(xyScale(s[0], s[1]), 0.8);
        }
      });

      // The output matrix is a solid color of the selected weight.
      outputColorizer = (i, j) => {
        const color = xyScale(hoverH, hoverW);
        // If the output is the animated one, darken it, so we can
        // see the animation.
        if (i === animatedH && j === animatedW) {
          return color.darker(1);
        }
        return color;
      };
    }
    */

    return (
      <div className="viewport">
        <div className="grid-container">
          Storage ({storage_height} × {storage_width}):
          <Grid height={storage_height} width={storage_width}
                colorizer={storageColorizer}
                onMouseEnter={(e, i, j) => {
                  this.setState({hoverOver: "storage", hoverH: i, hoverW: j});
                }}
                onMouseLeave={(e, i, j) => {
                  this.setState({hoverOver: undefined, hoverH: undefined, hoverW: undefined});
                }}
                />
        </div>
        <div className="grid-container">
          View ({view_height} × {view_width}):
          <Grid height={view_height} width={view_width}
                colorizer={viewColorizer}
                onMouseEnter={(e, i, j) => {
                  this.setState({hoverOver: "view", hoverH: i, hoverW: j});
                }}
                onMouseLeave={(e, i, j) => {
                  this.setState({hoverOver: undefined, hoverH: undefined, hoverW: undefined});
                }}
                />
        </div>
      </div>
      );
    }
}

/**
 * A matrix grid which we render our matrix animations.
 *
 * Properties:
 *    - height: height of the matrix
 *    - width: widht of the matrix
 *    - colorizer: A function f(i, j), returning the color of the i,j cell
 *    - onMouseEnter: A callback invoked f(event, i, j) when the i,j cell is
 *                    entered by a mouse.
 *    - onMouseLeave: A callback invoked f(event, i, j) when the i,j cell is
 *                    left by a mouse.
 */
function Grid(props) {
  const height = parseInt(props.height, 10);
  const width = parseInt(props.width, 10);
  const grid = array2d(height, width);
  const xgrid = grid.map((row, i) => {
    const xrow = row.map((e, j) => {
      // Use of colorizer this way means we force recompute of all tiles
      const color = props.colorizer ? props.colorizer(i, j) : undefined;
      return <td key={j}
                 style={{backgroundColor: color}}
                 onMouseEnter={props.onMouseEnter ?
                               ((e) => props.onMouseEnter(e, i, j)) : undefined}
                 onMouseLeave={props.onMouseLeave ?
                               ((e) => props.onMouseLeave(e, i, j)) : undefined} />
    });
    return <tr key={i}>{xrow}</tr>;
  });
  return <table><tbody>{xgrid}</tbody></table>;
}

// ========================================

ReactDOM.render(
  <App />,
  document.getElementById('root')
);
