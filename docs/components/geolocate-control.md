# Geolocate Control

This is a React equivalent of Mapbox's [GeolocateControl](https://www.mapbox.com/mapbox-gl-js/api/#geolocatecontrol).

```js
import React, { Component } from "react";
import ReactMapGL, {GeolocateControl} from "react-map-gl";

class Map extends Component {
  render() {
    const { viewport, updateViewport } = this.props;
    return (
      <ReactMapGL {...viewport} onViewportChange={updateViewport}>
        <div style={{ position: "absolute", right: 0 }}>
          <GeolocateControl 
            positionOptions={{enableHighAccuracy: true}}
            trackUserLocation={true}
            onViewportChange={updateViewport}
          />
        </div>
      </ReactMapGL>
    );
  }
}
```

## Properties

Accepts all the options of [Mapbox GeolocatControl](https://docs.mapbox.com/mapbox-gl-js/api/#geolocatecontrol)

##### `onViewportChange` {Function}

Callback when the viewport needs to be updated. See [InteractiveMap](/docs/components/interactive-map.md).


## Styling

Like its Mapbox counterpart, this control relies on the mapbox-gl stylesheet to work properly. Make sure to add the stylesheet to your page.

## Source

[geolocate-control.js](https://github.com/uber/react-map-gl/tree/master/src/components/geolocate-control.js)
