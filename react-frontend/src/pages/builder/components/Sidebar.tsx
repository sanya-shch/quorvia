import { Droppable, Draggable } from "@hello-pangea/dnd";
import { useTranslation } from "react-i18next";
import { getSidebarItems } from "../constants";

export default function Sidebar() {
  const { t } = useTranslation();
  const SIDEBAR_ITEMS = getSidebarItems(t);

  return (
    <aside className="w-full md:w-64 shrink-0">
      <div className="sticky top-24">
        <Droppable
          droppableId="sidebar-items"
          isDropDisabled
          type="QUESTIONS"
          renderClone={(provided, _, rubric) => {
            const item = SIDEBAR_ITEMS[rubric.source.index];

            return (
              <div
                ref={provided.innerRef}
                {...provided.draggableProps}
                {...provided.dragHandleProps}
                style={provided.draggableProps.style}
                className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-medium bg-white"
              >
                <span className="text-lg">{item.icon}</span>
                <span>{item.label}</span>
              </div>
            );
          }}
        >
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col">
              {SIDEBAR_ITEMS.map((item, index) => (
                <Draggable
                  key={`sidebar-${item.type}`}
                  draggableId={`sidebar-${item.type}`}
                  index={index}
                >
                  {(draggableProvided, snapshot) => {
                    const draggableStyle = {
                      ...draggableProvided.draggableProps.style,
                      ...(snapshot.isDropAnimating && {
                        transform: "translate(0px, 0px)",
                        opacity: 0,
                        transition: "all 0.001s ease",
                      }),
                    };

                    return (
                      <>
                        <div
                          ref={draggableProvided.innerRef}
                          {...draggableProvided.draggableProps}
                          {...draggableProvided.dragHandleProps}
                          style={draggableStyle}
                          className={`flex items-center gap-3 rounded-xl border border-slate-200 p-3 mb-2 text-sm font-medium bg-white cursor-grab active:cursor-grabbing ${
                            snapshot.isDragging
                              ? ""
                              : "text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <span className="text-lg">{item.icon}</span>
                          <span>{item.label}</span>
                        </div>

                        {snapshot.isDragging && (
                          <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 mb-2 text-sm font-medium bg-slate-50 text-slate-500">
                            <span className="text-lg">{item.icon}</span>
                            <span>{item.label}</span>
                          </div>
                        )}
                      </>
                    );
                  }}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </div>
    </aside>
  );
}
