const cleanText = (value, maxLength) => String(value || "").trim().slice(0, maxLength);

export const getInputImageIdentity = (formValues = {}, nodeId = "") => {
  const sequence = String(nodeId).replace(/^\D+/g, "") || "1";
  return {
    label: cleanText(formValues.node_label, 60) || `Input Image #${sequence}`,
    description: cleanText(formValues.node_description, 180),
  };
};

export const sanitizeNodeIdentity = ({ label = "", description = "" } = {}) => ({
  node_label: cleanText(label, 60),
  node_description: cleanText(description, 180),
});
