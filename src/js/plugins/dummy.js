import DOM from '../utils/dom';

/**
 * Dummy plugin
 */
export default class Dummy {
  /**
   * @param {WebSlides} wsInstance The WebSlides instance
   * @constructor
   */
  constructor(wsInstance) {
    /**
     * @type {WebSlides}
     * @private
     */
    this.ws_ = wsInstance;

    this.bindEvents_();
  }

  /**
   * Bind all events for the navigation.
   * @private
   */
  bindEvents_() {
    this.ws_.el.addEventListener(
      'ws:slide-change', this.onSlideChanged_.bind(this));
  }

  /**
   * Slide Change event handler. Will update the text on the navigation.
   * @param {CustomEvent} event
   * @private
   */
  onSlideChanged_(event) {
    console.log("Dummy event: current slide: " + event.detail.currentSlide)
  }
}
