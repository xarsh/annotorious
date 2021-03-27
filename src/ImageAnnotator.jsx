import React, { Component } from 'react';
import AnnotationLayer from './AnnotationLayer';
import { Editor } from '@recogito/recogito-client-core';

import './ImageAnnotator.scss';

export default class ImageAnnotator extends Component  {

  state = {
    selectedAnnotation: null,
    selectedDOMElement: null,
    modifiedTarget: null,

    // Headless modea
    editorDisabled: this.props.config.disableEditor,

    // Records the state before any potential headless modify (done via
    // .updateSelected) so we can properly fire the updateAnnotation(a, previous)
    // event, and distinguish between headless Save and Cancel 
    beforeHeadlessModify: null
  }

  /** Shorthand **/
  clearState = opt_callback => this.setState({
    selectedAnnotation: null,
    selectedDOMElement: null,
    modifiedTarget: null,
    beforeHeadlessModify: null
  }, opt_callback);

  componentDidMount() {
    this.annotationLayer = new AnnotationLayer(this.props);

    this.annotationLayer.on('select', this.handleSelect);
  
    this.annotationLayer.on('updateTarget', this.handleUpdateTarget);

    this.annotationLayer.on('mouseEnterAnnotation', this.handleMouseEnter);
    this.annotationLayer.on('mouseLeaveAnnotation', this.handleMouseLeave);

    // In headless mode, Escape cancels editing
    if (this.props.config.disableEditor)
      document.addEventListener('keyup', this.headlessCancel);
  }

  componentWillUnmount() {
    this.annotationLayer.destroy();

    if (this.state.editorDisabled)
      document.removeEventListener('keyup', this.headlessCancel);
  }

  // Handle Escape key in headless mode
  headlessCancel = evt => {
    if (evt.which === 27)  { // Escape
      this.clearState();
      this.annotationLayer.deselect();
    }
  }

  handleSelect = evt => {
    this.state.editorDisabled ?
      this.onHeadlessSelect(evt) : this.onNormalSelect(evt);
  }

  /** Selection when editorDisabled == false **/
  onNormalSelect = evt => {   
    const { annotation, element, skipEvent } = evt;

    if (annotation) {
      // Select action needs to run immediately if no annotation was
      // selected before. Otherwise, make a deselect state change first,
      // and then select after this state change has completed. (This is
      // keep our external event cycle clean!)      
      const select = () => {
        this.setState({ 
          selectedAnnotation: annotation,
          selectedDOMElement: element,
          modifiedTarget: null,
          beforeHeadlessModify: null
        }, () => {  
          if (!skipEvent) {
            if (annotation.isSelection) {
              this.props.onSelectionCreated(annotation.clone());
            } else {
              this.props.onAnnotationSelected(annotation.clone());  
            }
          }
        });
      }

      // If there is another selected annotation,
      // fire cancel before making the new selection
      const { selectedAnnotation } = this.state;

      if (selectedAnnotation && !selectedAnnotation.isEqual(annotation)) {
        this.clearState(() => {
          this.props.onCancelSelected(selectedAnnotation);
          select();
        });
      } else {
        select();
      }
    } else {
      const { selectedAnnotation } = this.state; 

      if (selectedAnnotation)
        this.clearState(() => { 
          this.props.onCancelSelected(selectedAnnotation);
        });
      else
        this.clearState();
    }
  }

  /** Selection when editorDisabled == true **/
  onHeadlessSelect = evt => {
    // When in headless mode, changing selection acts as 'Ok' - changes
    // to the previous annotation are stored! (In normal mode, selection
    // acts as 'Cancel'.)
    this.saveSelected().then(() =>
      this.onNormalSelect(evt));
  }

  handleUpdateTarget = (selectedDOMElement, modifiedTarget) => {
    this.setState({ selectedDOMElement, modifiedTarget });

    const clone = JSON.parse(JSON.stringify(modifiedTarget));
    this.props.onSelectionTargetChanged(clone);
  }

  handleMouseEnter = annotation =>
    this.props.onMouseEnterAnnotation(annotation.clone());

  handleMouseLeave = annotation =>
    this.props.onMouseLeaveAnnotation(annotation.clone());

  /**
   * A convenience method that allows the external application to
   * override the autogenerated Id for an annotation.
   */
  overrideAnnotationId = originalAnnotation => forcedId => {
    const { id } = originalAnnotation;

    // Force the editor to close first, otherwise there's a risk of orphaned annotation
    if (this.state.selectedAnnotation) {
      this.clearState(() => {
        this.annotationLayer.overrideId(id, forcedId);
      });
    } else {
      this.annotationLayer.overrideId(id, forcedId);
    }
  }

  /**************************/  
  /* Annotation CRUD events */
  /**************************/  

  /** Common handler for annotation CREATE or UPDATE **/
  onCreateOrUpdateAnnotation = (method, opt_callback) => (annotation, previous) => {
    // Merge updated target if necessary
    let a = annotation.isSelection ? annotation.toAnnotation() : annotation;

    a = (this.state.modifiedTarget) ?
      a.clone({ target: this.state.modifiedTarget }) : a.clone();

    this.clearState(() => {      
      this.annotationLayer.deselect();
      this.annotationLayer.addOrUpdateAnnotation(a, previous);
    
      // Call CREATE or UPDATE handler
      if (previous)
        this.props[method](a, previous.clone());
      else
        this.props[method](a, this.overrideAnnotationId(a));

      opt_callback && opt_callback();
    });
  }

  onDeleteAnnotation = annotation => {
    this.clearState();
    this.annotationLayer.removeAnnotation(annotation);
    this.props.onAnnotationDeleted(annotation);
  }

  /** Cancel button on annotation editor **/
  onCancelAnnotation = (annotation, opt_callback) => {
    if (!this.state.editorDisabled)
      this.annotationLayer.deselect();
    
      this.props.onCancelSelected(annotation);
    this.clearState(opt_callback);
  }

  /****************/               
  /* External API */
  /****************/    

  addAnnotation = annotation =>
    this.annotationLayer.addOrUpdateAnnotation(annotation.clone());

  addDrawingTool = plugin =>
    this.annotationLayer.addDrawingTool(plugin);

  cancelSelected = () => {
    const { selectedAnnotation } = this.state;
    if (selectedAnnotation)
      this.onCancelAnnotation(selectedAnnotation);
  }

  get disableEditor() {
    return this.state.editorDisabled;
  }

  set disableEditor(disabled) {
    this.setState({ editorDisabled: disabled }, () => {
      // En- or disable Esc key listener
      if (disabled && !this.state.editorDisabled) {
        document.addEventListener('keyup', this.headlessCancel);
      } else if (!disabled && this.state.editorDisabled) {
        document.removeEventListener('keyup', this.headlessCancel);
      }
    });
  }
  
  getAnnotations = () =>
    this.annotationLayer.getAnnotations().map(a => a.clone());

  getSelected = () => {
    const selected = this.annotationLayer.getSelected();
    return selected ? selected.annotation.clone() : null;
  }

  getSelectedImageSnippet = () =>
    this.annotationLayer.getSelectedImageSnippet();

  listDrawingTools = () =>
    this.annotationLayer.listDrawingTools();

  removeAnnotation = annotationOrId =>
    this.annotationLayer.removeAnnotation(annotationOrId);

  /** 
   * This is a sync operation, so that the external API
   * can safely call things in sequence.
   */
  saveSelected = () =>
    new Promise(resolve => {
      const a = this.state.selectedAnnotation;

      if (a) {
        if (a.isSelection) {
          this.onCreateOrUpdateAnnotation('onAnnotationCreated', resolve)(a.toAnnotation(), a);
        } else {
          // Headless update? 
          const { beforeHeadlessModify, modifiedTarget } = this.state;
  
          if (beforeHeadlessModify) {
            // Annotation was modified using '.updateSelected()'
            this.onCreateOrUpdateAnnotation('onAnnotationUpdated', resolve)(a, beforeHeadlessModify);
          } else if (modifiedTarget) {
            // Target was modified, but otherwise no change
            this.onCreateOrUpdateAnnotation('onAnnotationUpdated', resolve)(a, a);
          } else {
            this.onCancelAnnotation(a, resolve);
          } 
        }
      } else {
        resolve();
      }
    });

  selectAnnotation = arg => {
    const annotation = this.annotationLayer.selectAnnotation(arg);
    
    if (annotation)
      return annotation.clone();
    else
      this.clearState(); // Deselect
  }
  
  setAnnotations = annotations =>
    this.annotationLayer.init(annotations.map(a => a.clone()));

  setDrawingTool = shape =>
    this.annotationLayer.setDrawingTool(shape);

  setVisible = visible =>
    this.annotationLayer.setVisible(visible);

  /** 
   * This is a sync operation, so that the external API
   * can safely call things in sequence.
   */
  updateSelected = (annotation, saveImmediately) =>
    new Promise(resolve => {
      if (this.state.selectedAnnotation) {
        if (saveImmediately) {
          if (this.state.selectedAnnotation.isSelection) {
            this.onCreateOrUpdateAnnotation('onAnnotationCreated', resolve)(annotation);
          } else {
            this.onCreateOrUpdateAnnotation('onAnnotationUpdated', resolve)(annotation, this.state.selectedAnnotation);
          }
        } else {
          this.setState({ 
            selectedAnnotation: annotation, // Updated annotation 
            beforeHeadlessModify: this.state.beforeHeadlessModify || this.state.selectedAnnotation 
          }, resolve);
        }
      }  
    });
    
  render() {
    // The editor should open under normal conditions - annotation was selected, no headless mode
    const open = this.state.selectedAnnotation && !this.state.editorDisabled;

    const readOnly = this.props.config.readOnly || this.state.selectedAnnotation?.readOnly

    return (open && (
      <Editor
        wrapperEl={this.props.wrapperEl}
        annotation={this.state.selectedAnnotation}
        modifiedTarget={this.state.modifiedTarget}
        selectedElement={this.state.selectedDOMElement}
        readOnly={readOnly}
        config={this.props.config}
        env={this.props.env}
        onAnnotationCreated={this.onCreateOrUpdateAnnotation('onAnnotationCreated')}
        onAnnotationUpdated={this.onCreateOrUpdateAnnotation('onAnnotationUpdated')}
        onAnnotationDeleted={this.onDeleteAnnotation}
        onCancel={this.onCancelAnnotation} />
    ))
  }

}
