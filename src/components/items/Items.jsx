import { Tabs, Tab, SSRProvider } from 'react-bootstrap';
import ItemsInner from './ItemsInner.jsx';
import Global from '../Global.jsx';

export default function Items({ items }) {
  const playerClasses = Object.keys(itemUsedBy);
  return (
  <div className="items-root">
    <SSRProvider>
      <Global items={items} />
      <Tabs defaultActiveKey="default">
        <Tab eventKey="default" title="Default">
          <ItemsInner playerClass="default" items={{default: items["default"]}}  />
        </Tab>
        {playerClasses.map(playerClass => 
          <Tab key={`${playerClass}-tab`} eventKey={playerClass} title={playerClass[0].toUpperCase() + playerClass.slice(1)}>
            <ItemsInner playerClass={playerClass} items={Object.fromEntries(itemUsedBy[playerClass].map(i => [i, items[i]]))} />
          </Tab>
        )}
      </Tabs>
    </SSRProvider>
  </div>
  );
}
