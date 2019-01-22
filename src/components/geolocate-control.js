/* global window */
import {createElement, createRef} from 'react';
import PropTypes from 'prop-types';
import WebMercatorViewport from 'viewport-mercator-project';
import {GeolocateControl as MapboxGeolocateControl, LngLat} from '../utils/mapboxgl';

import BaseControl from './base-control';
import Marker from './marker';
import MapState from '../utils/map-state';
import TransitionManager from '../utils/transition-manager';

const LINEAR_TRANSITION_PROPS = Object.assign(
  {},
  TransitionManager.defaultProps,
  {
    transitionDuration: 500
  }
);

// a copy of mapbox Event class
class Event {
  constructor(type, data) {
    for (const prop in data) {
      this[prop] = data[prop];
    }

    this.type = type;
  }
}

const propTypes = Object.assign({}, BaseControl.propTypes, {
  // Custom className
  className: PropTypes.string,

  // mapbox geolocate options
  // https://docs.mapbox.com/mapbox-gl-js/api/#geolocatecontrol
  positionOptions: PropTypes.object,
  fitBoundsOptions: PropTypes.object,
  trackUserLocation: PropTypes.bool,
  showUserLocation: PropTypes.bool,

  // Callbacks fired when the user interacted with the map. The object passed to the callbacks
  // contains viewport properties such as `longitude`, `latitude`, `zoom` etc.
  onViewStateChange: PropTypes.func,
  onViewportChange: PropTypes.func
});

const defaultProps = Object.assign({}, BaseControl.defaultProps, {
  className: '',
  // mapbox geolocate options
  positionOptions: {
    enableHighAccuracy: false,
    maximumAge: 0,
    timeout: 6000 /* 6 sec */
  },
  fitBoundsOptions: {
    maxZoom: 15
  },
  trackUserLocation: false,
  showUserLocation: true,

  // viewport handlers
  onViewStateChange: () => {},
  onViewportChange: () => {}
});

const WATCH_STATE = {
  OFF: 'OFF',
  WAITING: 'WAITING',
  WAITING_ACTIVE: 'WAITING_ACTIVE',
  ACTIVE: 'ACTIVE',
  ACTIVE_LOCK: 'ACTIVE_LOCK',
  ACTIVE_ERROR: 'ACTIVE_ERROR',
  BACKGROUND: 'BACKGROUND',
  BACKGROUND_ERROR: 'BACKGROUND_ERROR'
};

export default class GeolocateControl extends BaseControl {
  static propTypes = propTypes;
  static defaultProps = defaultProps;

  constructor(props) {
    super(props);

    this.state = {
      supportsGeolocation: undefined,
      markerPosition: {
        longitude: 0,
        latitude: 0
      }
    };
  }

  _containerRef : { current: null | HTMLDivElement } = createRef();
  _geolocateButtonRef : { current: null | HTMLDivElement } = createRef();
  _markerRef : { current: null | HTMLDivElement } = createRef();

  componentDidMount() {
    this._checkGeolocationSupport();
  }

  _setupMapboxGeolocateControl = (supportsGeolocation) => {
    if (!supportsGeolocation) {
      /* eslint-disable no-console, no-undef */
      console.warn(
        'Geolocation support is not available, the GeolocateControl will not be visible.'
      );
      /* eslint-enable no-console, no-undef */
      return;
    }

    const controlOptions = {};
    ['positionOptions', 'fitBoundsOptions', 'trackUserLocation', 'showUserLocation'].forEach(
      prop => {
        if (this.props[prop]) {
          controlOptions[prop] = this.props[prop];
        }
      }
    );

    this._mapboxGeolocateControl = new MapboxGeolocateControl(controlOptions);

    // replace mapbox internal prop
    this._mapboxGeolocateControl._map = this._context.map;
    this._mapboxGeolocateControl._watchState = WATCH_STATE.OFF;

    // replace mapbox internal UI elements
    this._mapboxGeolocateControl._geolocateButton = this._geolocateButtonRef.current;
    this._mapboxGeolocateControl._userLocationDotMarker = this._markerRef.current;
    this._mapboxGeolocateControl._dotElement = this._markerRef.current._containerRef.current;

    // replace mapbox internal methods
    this._mapboxGeolocateControl._updateMarker = this._updateMarker;
    this._mapboxGeolocateControl._updateCamera = this._updateCamera;

    this._mapboxGeolocateControl._setup = true;
  };

  componentWillReceiveProps(nextProps) {
    if (nextProps.trackUserLocation) {
      this.setState({watchState: WATCH_STATE.OFF}, () => {
        const {map} = this._context;
        map.on('movestart', event => {
          // when the camera is changed (and it's not as a result of the Geolocation Control) change
          // the watch mode to background watch, so that the marker is updated but not the camera.
          if (
            !event.geolocateSource &&
            this._mapboxGeolocateControl.watchState === WATCH_STATE.ACTIVE_LOCK
          ) {
            const button = this._mapboxGeolocateControl._geolocateButton;
            button.classList.delete('mapboxgl-ctrl-geolocate-active');
            button.classList.add('mapboxgl-ctrl-geolocate-background');

            this._mapboxGeolocateControl._watchState = WATCH_STATE.BACKGROUND;

            this._mapboxGeolocateControl.fire(
              new Event('trackuserlocationend')
            );
          }
        });
      });
    }
  }

  _checkGeolocationSupport() {
    // not necessary to check again
    const {supportsGeolocation} = this.state;
    if (supportsGeolocation !== undefined) {
      return;
    }

    if (window.navigator.permissions !== undefined) {
      // navigator.permissions has incomplete browser support
      // http://caniuse.com/#feat=permissions-api
      // Test for the case where a browser disables Geolocation because of an
      // insecure origin
      window.navigator.permissions.query({name: 'geolocation'}).then(p => {
        this.setState(
          {supportsGeolocation: p.state !== 'denied'},
          () => this._setupMapboxGeolocateControl(this.state.supportsGeolocation)
        );
      });
    } else {
      this.setState(
        {supportsGeolocation: Boolean(window.navigator.geolocation)},
        () => this._setupMapboxGeolocateControl(this.state.supportsGeolocation)
      );
    }
  }

  trigger = () => {
    return this._mapboxGeolocateControl.trigger();
  };

  _updateMarker = position => {
    if (position) {
      this.setState({markerPosition: position.coords});
    }
  };

  _getBounds = position => {
    const center = new LngLat(
      position.coords.longitude,
      position.coords.latitude
    );
    const radius = position.coords.accuracy;
    const bounds = center.toBounds(radius);

    return [
      [bounds._ne.lng, bounds._sw.lat],
      [bounds._sw.lng, bounds._sw.lat]
    ];
  };

  _updateCamera = position => {
    const {viewport} = this._context;

    const bounds = this._getBounds(position);
    const {longitude, latitude, zoom} = new WebMercatorViewport(viewport)
      .fitBounds(bounds, {
        padding: 20,
        offset: [0, -100]
      });

    const newViewState = Object.assign({}, viewport, {longitude, latitude, zoom});
    const mapState = new MapState(newViewState);
    const viewState = Object.assign(
      {},
      mapState.getViewportProps(),
      LINEAR_TRANSITION_PROPS
    );

    // Call new style callback
    this.props.onViewStateChange({viewState});

    // Call old style callback
    this.props.onViewportChange(viewState);
  };

  _renderButton = (type, label, callback, children) => {
    return createElement('button', {
      key: type,
      className: `mapboxgl-ctrl-icon mapboxgl-ctrl-${type}`,
      ref: this._geolocateButtonRef,
      type: 'button',
      title: label,
      onClick: callback,
      children
    });
  };

  _renderMarker = () => {
    const {markerPosition} = this.state;
    return createElement(Marker, {
      key: 'location-maker',
      ref: this._markerRef,
      className: 'mapboxgl-user-location-dot',
      longitude: markerPosition.longitude,
      latitude: markerPosition.latitude,
      onContextMenu: e => e.preventDefault(),
      captureDrag: false,
      captureDoubleClick: false
    });
  };

  _render() {
    if (!this.state.supportsGeolocation) {
      return null;
    }

    const {className, showUserLocation} = this.props;
    return createElement(
      'div',
      {
        className: `mapboxgl-ctrl mapboxgl-ctrl-group ${className}`,
        ref: this._containerRef,
        onContextMenu: e => e.preventDefault()
      },
      [
        showUserLocation && this._renderMarker(),
        this._renderButton('geolocate', 'Geolocate', this.trigger)
      ]
    );
  }
}
