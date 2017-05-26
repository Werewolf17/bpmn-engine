'use strict';

const Code = require('code');
const Lab = require('lab');
const testHelpers = require('../helpers/testHelpers');

const lab = exports.lab = Lab.script();
const expect = Code.expect;

lab.experiment('Task', () => {
  lab.describe('events', () => {
    const taskProcessXml = `
  <?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <process id="theProcess" isExecutable="true">
      <startEvent id="start" />
      <task id="task" />
      <endEvent id="end" />
      <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
      <sequenceFlow id="flow2" sourceRef="task" targetRef="end" />
    </process>
  </definitions>`;

    let context;
    lab.beforeEach((done) => {
      testHelpers.getContext(taskProcessXml, (err, result) => {
        if (err) return done(err);
        context = result;
        done();
      });
    });

    lab.test('emits start on taken inbound', (done) => {
      const task = context.getChildActivityById('task');
      task.activate();
      task.once('start', () => {
        done();
      });

      task.inbound[0].take();
    });

    lab.test('leaves on discarded inbound', (done) => {
      const task = context.getChildActivityById('task');
      task.activate();
      task.once('start', () => {
        Code.fail('No start should happen');
      });
      task.once('leave', () => {
        done();
      });

      task.inbound[0].discard();
    });
  });

  lab.describe('IO', () => {
    const taskProcessXml = `
    <?xml version="1.0" encoding="UTF-8"?>
    <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
      <process id="theProcess" isExecutable="true">
        <startEvent id="start" />
        <task id="task">
          <extensionElements>
            <camunda:inputOutput>
              <camunda:inputParameter name="input">\${variables.message}</camunda:inputParameter>
              <camunda:outputParameter name="output">Input was \${input}</camunda:outputParameter>
            </camunda:inputOutput>
          </extensionElements>
        </task>
        <endEvent id="end" />
        <sequenceFlow id="flow1" sourceRef="start" targetRef="task" />
        <sequenceFlow id="flow2" sourceRef="task" targetRef="end" />
      </process>
    </definitions>`;

    let context;
    lab.beforeEach((done) => {
      testHelpers.getContext(taskProcessXml, {
        camunda: require('camunda-bpmn-moddle/resources/camunda')
      }, (err, result) => {
        if (err) return done(err);
        context = result;
        done();
      });
    });

    lab.test('event argument getInput() on start returns input parameters', (done) => {
      context.variables = {
        message: 'exec'
      };

      const task = context.getChildActivityById('task');
      task.activate();
      task.once('start', (activity) => {
        expect(activity.getInput()).to.equal({
          input: 'exec'
        });
        done();
      });

      task.inbound[0].take();
    });

    lab.test('event argument getOutput() on end returns output parameter value based on input parameters', (done) => {
      context.variables = {
        message: 'exec'
      };

      const task = context.getChildActivityById('task');
      task.activate();
      task.once('end', (activity) => {
        expect(activity.getOutput()).to.equal({
          output: 'Input was exec'
        });
        done();
      });

      task.inbound[0].take();
    });
  });

  lab.describe('loop', () => {
    lab.describe('sequential', () => {
      let context;
      lab.beforeEach((done) => {
        getLoopContext(true, (err, result) => {
          if (err) return done(err);
          context = result;
          done();
        });
      });

      lab.test('emits start with the same id', (done) => {
        const task = context.getChildActivityById('task');
        task.activate();

        const starts = [];
        task.on('start', (activity) => {
          starts.push(activity.id);
        });
        task.once('end', () => {
          expect(starts).to.be.equal(['task', 'task', 'task']);
          done();
        });

        task.run();
      });

      lab.test('assigns input', (done) => {
        const task = context.getChildActivityById('task');
        task.activate();

        const doneTasks = [];
        task.on('start', (activity) => {
          doneTasks.push(activity.getInput().do);
        });

        task.once('end', () => {
          expect(doneTasks).to.equal(['labour', 'archiving', 'shopping']);
          done();
        });

        task.run();
      });

    });

    lab.describe('parallell', () => {
      let context;
      lab.beforeEach((done) => {
        getLoopContext(false, (err, result) => {
          if (err) return done(err);
          context = result;
          done();
        });
      });

      lab.test('emits start with different ids', (done) => {
        const task = context.getChildActivityById('task');
        task.activate();

        const starts = [];
        task.on('start', (activity) => {
          starts.push(activity.id);
        });
        task.once('end', () => {
          expect(starts.includes(task.id), 'unique task id').to.be.false();
          done();
        });

        task.run();
      });

      lab.test('assigns input', (done) => {
        const task = context.getChildActivityById('task');
        task.activate();

        const starts = [];
        task.on('start', (activity) => {
          starts.push(activity.getInput());
        });

        task.once('end', () => {
          expect(starts).to.equal([{do: 'labour'}, {do: 'archiving'}, {do: 'shopping'}]);
          done();
        });

        task.run();
      });


    });
  });

});

function getLoopContext(isSequential, callback) {
  const processXml = `
  <?xml version="1.0" encoding="UTF-8"?>
  <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
    <process id="sequentialLoopProcess" isExecutable="true">
      <task id="task">
        <multiInstanceLoopCharacteristics isSequential="${isSequential}" camunda:collection="\${variables.analogue}">
          <loopCardinality>5</loopCardinality>
        </multiInstanceLoopCharacteristics>
        <extensionElements>
          <camunda:inputOutput>
            <camunda:inputParameter name="do">\${item}</camunda:inputParameter>
          </camunda:inputOutput>
        </extensionElements>
      </task>
    </process>
  </definitions>`;
  testHelpers.getContext(processXml, {
    camunda: require('camunda-bpmn-moddle/resources/camunda')
  }, (err, context) => {
    if (err) return callback(err);
    context.variables.analogue = ['labour', 'archiving', 'shopping'];
    callback(null, context);
  });
}